const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const mongoose = require("mongoose");
const dotenv = require('dotenv').config();

const { Web3 } = require('web3');
const { abi, bytecode } = require("./BuilderOfTheCakeToken.json");
const web3 = new Web3('https://polygon-rpc.com');
const myContract = new web3.eth.Contract(abi, process.env.BOTC_CONTRACT_ADDRESS);

const app = express();

const NftTemplate = require("./models/NftTemplate");
const Recipient = require("./models/Recipient");
const Nft = require('./models/Nft');

mongoose.connect(process.env.MONGO_URI);

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/nft-template', async (req, res) => {
    const nftTemplates = await NftTemplate.find().sort({ weight: 1 });
    res.json({ success: true, nftTemplates: nftTemplates });
});

app.get('/nft', async (req, res) => {
    const nfts = await Nft.find().sort({ weight: -1 });
    res.json({ success: true, nfts: nfts });
});

app.post('/claim', async (req, res) => {
    console.log("POST /claim", req.body);

    if (!req.body.address || !web3.utils.toChecksumAddress(req.body.address)) {
        res.json({
            success: false,
            message: "No valid address provided."
        });
        return;
    }

    // record recipient claim timestamp
    let recipient = await Recipient.findOne({ walletAddress: req.body.address });

    if (recipient) {
        // if lastClaimed is less than 24 hours ago, send an error
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - 24);

        if (recipient.lastClaimed > cutoff) {
            console.log(`${recipient.walletAddress} attempted a claim when lastClaimed is ${recipient.lastClaimed}.`);
            res.json({
                success: false,
                message: "You have already claimed an NFT within the last 24 hours."
            });
            return;
        }

        console.log(`Updating lastClaimed for ${recipient.walletAddress}.`);
        recipient.lastClaimed = new Date();
        await recipient.save();
    } else {
        console.log(`Creating a new Recipient for ${req.body.address}`);
        const newRecipient = new Recipient({
            email: "",
            walletAddress: req.body.address,
            lastClaimed: new Date()
        });
        await newRecipient.save();
        recipient = newRecipient;
    }

    const maticAmount = 10;
    
    const paymentRequest = {
        from: req.body.address,
        to: "0xf0eAc723A3d38Aec7fDB86092EB5cC3c61E62B07",
        value: "0x" + parseInt(web3.utils.toWei(maticAmount.toString(), 'ether')).toString(16),
        gas: "0x" + parseInt(web3.utils.toWei("100000", 'wei')).toString(16),
        reason: '0x0'
    };

    res.json({
        success: true,
        paymentRequest,
    });
});

app.post('/verify-transaction', async (req, res) => {
    const transactionHash = req.body.transactionHash;

    // Wait for the transaction confirmation
    try {
        const transactionReceipt = await getTransactionReceiptMined(transactionHash);
        console.log('Transaction confirmed:', transactionReceipt);

        let randomNftTemplate = await getRandomWeightedNftTemplate();
        console.log(`Picked ${randomNftTemplate.name} as NFT to generate.`);

        let tokenId = 0;
        const highestTokenIdDocument = await Nft.findOne().sort({ tokenId: -1 });
        if (highestTokenIdDocument) {
            console.log("FOUND: ", highestTokenIdDocument);
            tokenId = highestTokenIdDocument.tokenId + 1;
        } else {
            console.log("NOT FOUND");
        }
        
        let hash = await safeMint(req.body.address, tokenId, randomNftTemplate.jsonUri);

        const nftDocument = new Nft({
            name: randomNftTemplate.name,
            jsonUri: randomNftTemplate.jsonUri,
            imageUri: randomNftTemplate.imageUri,
            tokenId: tokenId,
            dateCreated: new Date()
        });
        await nftDocument.save();

        res.json({ 
            success: true,
            message: 'Claim request received successfully.', 
            address: req.body.address,
            nftTemplate: randomNftTemplate,
            transactionHash: hash
        });
    } catch (error) {
        console.error('Error verifying transaction:', error);
        res.json({ success: false, message: 'Error verifying transaction' });
    }
});

async function getTransactionReceiptMined(txHash, interval = 1000) {
    while (true) {
        try {
            console.log("Awaiting mined recipt.");
            const receipt = await web3.eth.getTransactionReceipt(txHash);

            if (receipt) {
                return receipt;
            }
        } catch (error) {
            // Ignore the error and retry
        }

        await new Promise(resolve => setTimeout(resolve, interval));
    }
}

async function getRandomWeightedNftTemplate() {
    try {
        const nftTemplates = await NftTemplate.find();
        const totalWeight = nftTemplates.reduce((acc, template) => acc + template.weight, 0);
        const randomNumber = Math.random() * totalWeight;
        let cumulativeWeight = 0;

        for (const template of nftTemplates) {
            cumulativeWeight += template.weight;
            if (randomNumber <= cumulativeWeight) {
                return template;
            }
        }

        return null;
    } catch (error) {
        console.error('Error fetching NftTemplates:', error);
        return null;
    }
}

async function getOwners() {
    const tokenIds = Array.from({ length: 6 }, (_, i) => i);

    for (const tokenId of tokenIds) {
        try {
            const owner = await myContract.methods.ownerOf(tokenId).call();
            console.log(`Token ID: ${tokenId}, Owner: ${owner}`);
        } catch (error) {
            console.error(`Error getting owner of token ${tokenId}.`);
        }
    }
}

async function safeMint(to, tokenId, uri) {
    const privateKey = process.env.PRIVATE_KEY;
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
  
    const gasPrice = await web3.eth.getGasPrice();
    const nonce = await web3.eth.getTransactionCount(account.address);
  
    const rawTransaction = {
        nonce: nonce,
        gasPrice: web3.utils.toHex(gasPrice),
        gasLimit: web3.utils.toHex(300000), 
        to: myContract.options.address,
        value: "0x0",
        data: myContract.methods.safeMint(to, tokenId, uri).encodeABI(),
    };
  
    const signedTransaction = await web3.eth.accounts.signTransaction(rawTransaction, privateKey);
    
    try {
        const result = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
        console.log(`Token ID ${tokenId} minted successfully. Transaction hash: ${result.transactionHash}`);
        return `${result.transactionHash}`;
    } catch (error) {
        console.error(`Error minting token ID ${tokenId}:`, error);
    }
}

app.listen(process.env.PORT, () => {
    console.log(`Server is running on http://localhost:${process.env.PORT}`);
});
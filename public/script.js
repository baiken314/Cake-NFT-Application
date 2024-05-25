let walletAddress;
let walletIsPolygon;

// public/script.js
const app = new Vue({
    el: '#app',
    data: {
        nftTemplates: [],
        transactionHash: "",
        state: "initial"
    },
    mounted() {
        this.fetchNftTemplates();
    },
    methods: {
        async fetchNftTemplates() {
            try {
                const response = await fetch('/nft-template');
                const data = await response.json();
                if (data.success) {
                    this.nftTemplates = data.nftTemplates;

                    // calculate percent rarity of NFTs

                    const totalWeight = this.nftTemplates.reduce((acc, template) => acc + template.weight, 0);

                    this.nftTemplates.forEach(template => {
                        template.percentRarity = ((template.weight / totalWeight) * 100).toFixed(2) + '%';
                    });
                } else {
                    console.error('Error fetching NFT templates:', data.error);
                }
            } catch (error) {
                console.error('Error fetching NFT templates:', error);
            }
        },
    },
});

function copyToClipboard(copyId) {
    const textarea = document.createElement('textarea');
    const element = document.getElementById(copyId);
    const textToCopy = element.dataset.copyText;
    console.log("Text to copy:" , textToCopy)
    textarea.value = textToCopy;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('Contract address copied to clipboard!');
}

// Check if MetaMask is installed
function connectWallet() {
    if (typeof window.ethereum !== 'undefined') {
        const ethereum = window.ethereum;

        // Request account access
        ethereum
            .request({ method: 'eth_requestAccounts' })
            .then((accounts) => {
                const userAddress = accounts[0];
                walletAddress = userAddress;
                console.log(`Connected to wallet. User address: ${userAddress}`);

                return true;
            })
            .catch((error) => {
                console.error('Wallet connection error:', error);
                return false;
            });
    } else {
        console.error('MetaMask is not installed');
        return false;
    }
}

async function checkWalletNetwork() {
    try {
        const chainId = await ethereum.request({ method: 'eth_chainId' });
        const isPolygon = chainId === '0x89' || chainId === '137'; // Mainnet or Matic
        walletIsPolygon = isPolygon;

        if (isPolygon) {
            console.log('Connected to Polygon (Matic) network');
        } else {
            console.log('Connected to a different network');
        }
    } catch (error) {
        console.error('Error getting chain ID:', error);
    }
}


async function requestMATIC() {
    const response = await fetch('/claim', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            address: walletAddress
        }),
    });

    const result = await response.json();
    console.log(result);

    if (result.success) {
        const paymentRequest = result.paymentRequest;
        console.log('Payment Request:', paymentRequest);

        try {
            if (window.ethereum) {
                const response = await window.ethereum.request({
                    method: 'eth_sendTransaction',
                    params: [paymentRequest],
                });
                
                console.log('Transaction response:', response);

                const verifyTransaction = async (transactionHash) => {
                    try {
                        const response = await fetch('/verify-transaction', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                transactionHash: transactionHash,
                                address: walletAddress
                            }),
                        });
                
                        const result = await response.json();
                        console.log(result);
                
                        if (result.success) {
                            console.log('Transaction verified successfully');
                        } else {
                            console.error('Error verifying transaction:', result.message);
                        }
                    } catch (error) {
                        console.error('Error verifying transaction:', error);
                    }
                };

                verifyTransaction(response);
            } else {
                console.error('Ethereum provider not found. Please make sure MetaMask or another wallet is connected.');
            }
        } catch (error) {
            console.error('Error sending transaction:', error);
        }
    } else {
        console.error('Error requesting MATIC:', result.message);
    }
}

async function submitForm(event) {
    event.preventDefault();

    if (!walletAddress) {
        alert("No wallet connected. Cannot claim NFT.");
        connectWallet();
        return;
    }

    await checkWalletNetwork();

    if (!walletIsPolygon) {
        alert("Wallet is connected on wrong network. Use the Polygon network.");
        return;
    }

    fetch('/claim', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address: walletAddress }),
    })
    .then(response => response.json())
    .then(async result => {
        if (result.success) {
            const paymentRequest = result.paymentRequest;
            console.log('Payment Request:', paymentRequest);

            try {
                if (window.ethereum) {
                    const response = await window.ethereum.request({
                        method: 'eth_sendTransaction',
                        params: [paymentRequest],
                    });
                    
                    console.log('Transaction response:', response);

                    const verifyTransaction = async (transactionHash) => {
                        try {
                            const response = await fetch('/verify-transaction', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    transactionHash: transactionHash,
                                    address: walletAddress
                                }),
                            });
                    
                            const result = await response.json();
                            console.log(result);
                    
                            if (result.success) {
                                console.log('Transaction verified successfully');
                                app.transactionHash = result.transactionHash;
                            } else {
                                console.error('Error verifying transaction:', result.message);
                            }
                        } catch (error) {
                            console.error('Error verifying transaction:', error);
                        }
                    };

                    app.state = "pending";

                    await verifyTransaction(response);

                    app.state = "initial";

                    alert("NFT claimed successfully!");
                } else {
                    console.error('Ethereum provider not found. Please make sure MetaMask or another wallet is connected.');
                }
            } catch (error) {
                console.error('Error sending transaction:', error);
            }
        } else {
            console.error('Error requesting MATIC:', result.message);
            alert(result.message);
        }
    })
    .catch(error => {
        console.error('Error claiming NFT:', error);
        alert('Error claiming NFT. Please make sure your wallet is connected.');
    });
}
  
connectWallet();
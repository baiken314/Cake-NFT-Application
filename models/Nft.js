const mongoose = require("mongoose");

const nftSchema = new mongoose.Schema({
    name: String,
    jsonUri: String,
    imageUri: String,
    tokenId: Number,
    dateCreated: Date
});

let Nft = mongoose.model("Nft", nftSchema);

module.exports = Nft;
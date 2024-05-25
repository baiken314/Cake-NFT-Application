const mongoose = require("mongoose");

const nftTemplateSchema = new mongoose.Schema({
    name: String,
    jsonUri: String,
    imageUri: String,
    weight: Number
});

let NftTemplate = mongoose.model("NftTemplate", nftTemplateSchema);

module.exports = NftTemplate;
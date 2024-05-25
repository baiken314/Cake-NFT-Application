const mongoose = require("mongoose");

const recipientSchema = new mongoose.Schema({
    email: String,
    walletAddress: {
        type: String,
        required: true,
        unique: true
    },
    lastClaimed: Date
});

let Recipient = mongoose.model("Recipient", recipientSchema);

module.exports = Recipient;
const buyerModel = require("../model/buyerModel");
const { uploadImg } = require("../utils/cloudinary");
const { validationResult } = require("express-validator");
const bcrypt = require('bcrypt');
const generatePassword = require("../helper/generatePassword");
const sendMail = require("../helper/sendMail");

const buyerRegistration = async (req, res) => {
    try {
        const salt = await bcrypt.genSalt(10);
        let password = generatePassword(req.body.fullName)
        const securedPassword = await bcrypt.hash(password, salt);
        // Validate request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        // Validate file arrays
        const requiredFiles = ["adhaar", "pan", "blankCheque", "source_of_fund"];
        for (const file of requiredFiles) {
            if (!req.files[file] || !Array.isArray(req.files[file]) || req.files[file].length === 0) {
                return res.status(400).json({ success: false, message: `Please upload ${file} file` });
            }
        }

        const newUser = new buyerModel({ ...req.body, isApproved: true, password: securedPassword, sellerId: req.user.id });

        // Upload files
        const uploadResults = {};
        for (const file of requiredFiles) {
            const uploadResult = await uploadImg(req.files[file][0].path, req.files[file][0].originalname);
            if (!uploadResult.success) {
                return res.status(500).json({ success: false, message: "Error uploading image" });
            }
            uploadResults[file] = uploadResult.url;
        }
        // Update user properties with Cloudinary URLs
        newUser.adhaar = uploadResults.adhaar;
        newUser.pan = uploadResults.pan;
        newUser.blankCheque = uploadResults.blankCheque;
        newUser.source_of_fund = uploadResults.source_of_fund;

        await newUser.save();
        const message = `Your account is registered successfully in Real State Bharat Escrow as a Buyer , Here are your credentials Email: ${req.body.email} and Password: ${password}`;
        await sendMail(req.body.email, "Welcome Buyer", message);
        res.status(200).json({ success: true, message, result: newUser });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: err.message });
    }
};


const listBuyer = async (req, res) => {
    try {
        const listAll = await buyerModel.find({ sellerId: req.user.id });

        if (listAll.length === 0) return res.status(204).json({ success: false, message: "No Record", result: [] });
        return res.status(200).json({ success: true, message: "fetched successfully", result: listAll });

    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: err.message });
    }
};

const deleteBuyer = async (req, res) => {
    const id = req.params.id;
    try {
        const findUser = await buyerModel.findOne({ _id: id })
        if (!findUser) return res.status(204).json({ success: false, message: "User does not found" })
        await buyerModel.findByIdAndDelete(id)
        return res.status(200).json({ success: true, message: `${findUser.fullName} deleted successfully` })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: err.message })
    }
}

module.exports = {
    listBuyer,
    buyerRegistration,
    deleteBuyer
}

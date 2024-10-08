const { error, success } = require("../helper/baseResponse")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const sellerModel = require("../model/sellorModel")
const buyerModel = require("../model/buyerModel")
const sendMail = require("../helper/sendMail")
const generateOtp = require("../helper/generateOtp")
const siteModel = require("../model/siteModel")
const userModel = require("../model/userModel")
const adminSellersLinkModel = require("../model/adminSellersLinkModel")
const sellerBuyersLinkModel = require("../model/sellerBuyersLinkModel")
const generatePassword = require("../helper/generatePassword")
const { validationResult } = require("express-validator")
require('dotenv').config();


// useful

const register = async (req, res) => {
    try {
        const { username, role, email } = req.body;

        const salt = await bcrypt.genSalt(10);
        let password = generatePassword(req.body.username)
        console.log("Generated Password:", password);
        const securedPassword = await bcrypt.hash(password, salt);
        // Validate request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        // conditions checking which role is being created 
        if (role === "seller") {
            if (req.user.role !== "admin") return res.status(403).json({ message: 'Only admins can create sellers.' });
            // seller regster 

            const newSeller = new userModel({
                ...req.body, username, password: securedPassword, role
            });

            // Validate file arrays for seller documents 
            const requiredFiles = ["adhaar", "companyPan", "blankCheque", "certificate_of_incorporate", "profile"];
            for (const file of requiredFiles) {
                if (!req.files[file] || !Array.isArray(req.files[file]) || req.files[file].length === 0) {
                    return res.status(400).json({ success: false, message: `Please upload ${file} file` });
                }
            }

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
            newSeller.adhaar = uploadResults?.adhaar;
            newSeller.profile = uploadResults?.profile;
            newSeller.companyPan = uploadResults?.companyPan;
            newSeller.blankCheque = uploadResults?.blankCheque;
            newSeller.certificate_of_incorporate = uploadResults?.certificate_of_incorporate;


            await adminSellersLinkModel({ adminID: req.user.id, sellerID: newSeller._id }).save()
            await newSeller.save();
            const message = `Here are your credentials Email: ${req.body.email} and Password: ${password}`;
            await sendMail(email, "Welcome Seller", message);
            return res.status(201).json({ message: 'seller created successfully', data: newSeller });

        } else if (role === "buyer") {
            //  register buyer
            if (req.user.role !== "seller") return res.status(403).json({ message: 'Only seller can create buyers.' });
            const newBuyer = new userModel({
                ...req.body, username, password: securedPassword, role
            });

            // Validate file arrays
            const requiredFiles = ["adhaar", "individualPan", "blankCheque", "source_of_fund", "profile"];
            for (const file of requiredFiles) {
                if (!req.files[file] || !Array.isArray(req.files[file]) || req.files[file].length === 0) {
                    return res.status(400).json({ success: false, message: `Please upload ${file} file` });
                }
            }

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
            newBuyer.adhaar = uploadResults.adhaar;
            newBuyer.profile = uploadResults.profile;
            newBuyer.individualPan = uploadResults.individualPan;
            newBuyer.blankCheque = uploadResults.blankCheque;
            newBuyer.source_of_fund = uploadResults.source_of_fund;
            await sellerBuyersLinkModel({ sellerID: req.user.id, buyerID: newBuyer._id })
            await newBuyer.save()
            const message = `Here are your credentials Email: ${req.body.email} and Password: ${password}`;
            await sendMail(email, "Welcome Buyer", message);
            return res.status(201).json({ message: 'buyer created successfully', data: newBuyer });

        } else if (role === "admin") {
            //  register admin
            const newAdmin = new userModel({
                username, password: securedPassword, role, email
            });
            await newAdmin.save();
            const message = `Here are your credentials Email: ${req.body.email} and Password: ${password}`;
            await sendMail(email, "Welcome Admin", message);
            return res.status(201).json({ message: 'admin created successfully', data: newAdmin });
        } else {

            return res.status(422).json(error(`ROLE: ${role} is invalid either it will be admin seller or buyer`, 422))
        }
    } catch (err) {
        return res.status(500).json(error(err.message, 500))
    }
}



const login = async (req, res) => {
    try {
        try {
            const { username, password } = req.body;
            const user = await userModel.findOne({ username })
            const isPasswordCorrect = await bcrypt.compare(password, user.password);
            if (!isPasswordCorrect)
                return res.status(400).json(error("Wrong Password Entered", 400));

            const payload = {
                username: user.username,
                role: user.role,
                id: user._id,
                email: user.email
            };
            const jwt_token = await jwt.sign(payload, process.env.JWT_KEY);

            let body = {
                username: user.username,
                role: user.role,
                token: jwt_token,
            };
            return res.status(200).json(success("Logged in successfully", body, 200));
        } catch (err) {
            return res.status(500).json(error(err.message), 500);
        }

    } catch (err) {
        return res.status(500).json(error(err.message, 500));
    }
};



// un used 

const generateOtpForPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(422).json(error("Email is missing", 422));
        const otp = generateOtp(6);

        const [sellerResult, buyerResult] = await Promise.all([
            sellerModel.findOne({ email }),
            buyerModel.findOne({ email })
        ]);
        if (!!sellerResult) {
            await sendMail(email, "Bharat Escrow Forgot Password OTP", "OTP is " + otp);
            await sellerModel.findOneAndUpdate({ email }, { otp: otp }, { new: true });
            return res.status(200).json(
                success("OTP Sent", sellerResult, 200)
            )
        }
        else if (!!buyerResult) {
            await sendMail(email, "Bharat Escrow Forgot Password OTP", "OTP is " + otp);
            await buyerModel.findOneAndUpdate({ email }, { otp: otp }, { new: true });
            return res.status(200).json(
                success("OTP Sent", buyerResult, 200)
            )
        } else {
            return res.status(500).json(
                error("Email not found ", 500)
            )
        }
    } catch (err) {
        return res.status(500).json(error(err.message, 500));
    }
};

const resetPassword = async (req, res) => {
    try {
        const { newPassword, otp, email } = req.body;
        const [sellerResult, buyerResult] = await Promise.all([
            sellerModel.findOne({ email }),
            buyerModel.findOne({ email })
        ]);
        if (!!sellerResult) {
            if (sellerResult?.otp != otp) {
                return res.status(400).json(error("Invalid OTP entered", 400));
            }
            const salt = await bcrypt.genSalt(10);
            const securedPassword = await bcrypt.hash(newPassword, salt);
            await sellerModel.findOneAndUpdate({ email }, { password: securedPassword }, { new: true });
            return res
                .status(200)
                .json(success("Updated", "Seller password updated", 200));
        }
        else if (!!buyerResult) {
            if (buyerResult?.otp != otp) {
                return res.status(400).json(error("Invalid OTP entered", 400));
            }
            const salt = await bcrypt.genSalt(10);
            const securedPassword = await bcrypt.hash(newPassword, salt);
            await buyerModel.findOneAndUpdate({ email }, { password: securedPassword }, { new: true });
            return res
                .status(200)
                .json(success("Updated", "Buyer password updated", 200));
        }

    } catch (err) {
        return res.status(500).json(error(err.message, 500));
    }
};







module.exports = {
    register,
    login,
    generateOtpForPasswordReset,
    resetPassword,
};
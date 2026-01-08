const mongoose = require('mongoose');
module.exports.connect = async () =>{
    try {
        await mongoose.connect(process.env.MONGODB_URL)
        console.log("kết nối thành công database")
    } catch (error) {
        console.log("kết nối thất bại database")
    }
}



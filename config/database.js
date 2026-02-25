const mongoose = require('mongoose');
module.exports.connect = async () =>{
    try {
        mongoose.set('strictQuery', true);
        await mongoose.connect(process.env.MONGODB_URL)
        console.log("kết nối thành công database")
    } catch (error) {
        console.log("kết nối thất bại database")
        console.error(error)
    }
}



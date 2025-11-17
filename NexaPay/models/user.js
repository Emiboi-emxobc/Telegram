//models/User.js
import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
   firstname:{type:String, required:true},
   lastname:{type:String,required:true},
   username:{type:String, unique:true, required:true},
   password:{type:String, required:true},
   age:{type:Date},
   balance:{type: Number, required:true,default:0},
   phone:{type:String},
   email:String,
   wallet:String,
   adminId:{type:mongoose.Types.ObjectId,ref:"Admin", required:true}
});

const User = mongoose.model("User",userSchema);
export default User;
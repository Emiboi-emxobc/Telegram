import dotenv from 'dotenv';
dotenv.config();
import User from './models/user.js';
import express from "express";
import cors from "cors";

const app = express();
const router = express.Router();

app.use(cors());
app.use(router);
app.use(express.json());

router.get("/",(req,res) =>{
   res.status(200).json({
      message:"NexaPay is active",
      success:true
   })
})

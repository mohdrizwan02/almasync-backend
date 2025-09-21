import mongoose from "mongoose";

import { DB_NAME } from "../constants.js";

const dbConnect = async () => {
  const mongouri = process.env.MONGODB_URI;

  try {
    const connectionInstance = await mongoose.connect(`${mongouri}`);
    console.log(
      `connection to the database is successfull || connected to DB-HOST ${connectionInstance.connection.port}`
    );
  } catch (error) {
    console.error("DB CONNCTION ERROR :: ", error);
    process.exit(1);
  }
};

export default dbConnect;

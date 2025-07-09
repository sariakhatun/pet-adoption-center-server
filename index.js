const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion } = require('mongodb');
dotenv.config(); // Load .env variables

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.50gybqn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    let db = client.db('petDB');
    let petsCollection = db.collection('pets')

    app.post("/pets", async (req, res) => {
      try {
        const pet = req.body;
        const result = await petsCollection.insertOne(pet);
        res.status(201).json(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to add pet" });
      }
    });

    // Get all pets
    app.get("/pets", async (req, res) => {
  try {
    const userEmail = req.query.email;

    // if email is provided, filter by email
    let query = {};
    if (userEmail) {
      query = { userEmail: userEmail };
    }
    let options = {
        sort:{createdAt:-1}
    }

    const pets = await petsCollection.find(query,options).toArray();
    res.json(pets);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pets" });
  }
});




   // await client.connect();
   
    // Send a ping to confirm a successful connection
   // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


// Test route
app.get("/", (req, res) => {
  res.send("PetNect server is running 🐾");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

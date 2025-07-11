const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion,ObjectId  } = require('mongodb');
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
    let donationCampaignsCollection=db.collection('donation-campaigns')
    let adoptionsCollection=db.collection('adoptions');


    //adoption request

    // Make sure to import ObjectId if needed

app.post("/adoptions", async (req, res) => {
  try {
    const adoptionData = req.body;

    if (
      !adoptionData.petId ||
      !adoptionData.petName ||
      !adoptionData.petImage ||
      !adoptionData.adopterName ||
      !adoptionData.adopterEmail ||
      !adoptionData.phone ||
      !adoptionData.address
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Optionally, mark the pet as adopted here:
    // await petsCollection.updateOne(
    //   { _id: new ObjectId(adoptionData.petId) },
    //   { $set: { adopted: true } }
    // );

    const result = await adoptionsCollection.insertOne(adoptionData);
    res.status(201).json({ insertedId: result.insertedId });
  } catch (error) {
    console.error("Failed to save adoption:", error);
    res.status(500).json({ error: "Failed to process adoption request" });
  }
});


    //donation campaign

    app.get("/donation-campaigns", async (req, res) => {
  try {
    const filter = {};

    if (req.query.email) {
      filter.createdBy = req.query.email;
    }

    const campaigns = await donationCampaignsCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.json(campaigns);
  } catch (err) {
    console.error("Error fetching campaigns:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/donation-campaigns/:id", async (req, res) => {
  try {
    const campaignId = req.params.id;
    const updates = req.body;

    // Allowed fields to update
    const allowedFields = [
      "petName",
      "petImage",
      "maxDonationAmount",
      "donationDeadline",
      "shortDescription",
      "longDescription",
      "paused",
    ];

    // Filter updates to allowed fields only
    const updateData = {};
    for (const key of allowedFields) {
      if (updates.hasOwnProperty(key)) {
        updateData[key] = updates[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const result = await donationCampaignsCollection.updateOne(
      { _id: new ObjectId(campaignId) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Donation campaign not found" });
    }

    res.json({ acknowledged: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error updating donation campaign:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



app.post("/donation-campaigns", async (req, res) => {
  try {
    const campaign = req.body;

    // Ensure required fields exist
    const requiredFields = [
      "petImage",
      "maxDonationAmount",
      "donationDeadline",
      "shortDescription",
      "longDescription",
      "createdBy",
      "createdAt",
    ];

    const missingFields = requiredFields.filter(field => !campaign[field]);
    if (missingFields.length) {
      return res
        .status(400)
        .json({ error: `Missing fields: ${missingFields.join(", ")}` });
    }

    // Insert into MongoDB
    const result = await donationCampaignsCollection.insertOne(campaign);
    res.status(201).json(result);
  } catch (err) {
    console.error("Error creating donation campaign:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


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
    const search = req.query.search || "";
    const category = req.query.category || "";
    const adopted = req.query.adopted === "false";
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 6;

    // Build dynamic query
    let query = {};

    if (userEmail) {
      query.userEmail = userEmail;
    }

    if (adopted) {
      query.adopted = false;
    }

    if (search) {
      query.petName = { $regex: search, $options: "i" };
    }

   if (category && category !== "all") {
  query.petCategory = category;
}


    const options = {
      sort: { createdAt: -1 },
      skip: page * limit,
      limit: limit,
    };

    const pets = await petsCollection.find(query, options).toArray();

    res.json(pets);
  } catch (err) {
    console.error("Failed to fetch pets:", err);
    res.status(500).json({ error: "Failed to fetch pets" });
  }
});

  // GET /pets/:id - Get a single pet by ID
    app.get("/pets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const pet = await petsCollection.findOne({ _id: new ObjectId(id) });
        if (!pet) return res.status(404).json({ error: "Pet not found" });
        res.json(pet);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch pet" });
      }
    });


     // PATCH /pets/:id - Update a pet by ID (partial update)
    app.patch("/pets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body;
        const result = await petsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );
        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Pet not found" });
        }
        res.json({ message: "Pet updated" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update pet" });
      }
    });

app.delete('/pets/:id', async (req, res) => {
  try {
    const petId = req.params.id;

    if (!ObjectId.isValid(petId)) {
      return res.status(400).json({ error: 'Invalid pet ID' });
    }

    const result = await petsCollection.deleteOne({ _id: new ObjectId(petId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Pet not found' });
    }

    res.json({ message: 'Pet deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete pet' });
  }
});




    await client.connect();
   
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
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

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion,ObjectId  } = require('mongodb');
let admin = require("firebase-admin");

dotenv.config(); // Load .env variables

console.log('Loaded PAYMENT_GATEWAY_KEY:', process.env.PAYMENT_GATEWAY_KEY);


const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

let decodedKey = Buffer.from(process.env.FB_SERVICE_KEY,'base64').toString('utf8')
var serviceAccount = JSON.parse(decodedKey)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});



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
    let donationsCollection=db.collection('donations');
    let usersCollection = db.collection('users')



    //custom middleware
    

    let verifyFBToken =async (req,res,next)=>{
      let authHeader = req.headers.authorization
      console.log('header in middleware',authHeader)
      if(!authHeader){
       return res.status(401).send({message: 'unauthorized access'})
      }
      let token = authHeader.split(' ')[1];
      if(!token){
         return res.status(401).send({message: 'unauthorized access'})
      }
      //verify token
     try{
       let decoded = await admin.auth().verifyIdToken(token)
       req.decoded=decoded;
        next();

     }catch(error){
        console.log('error from verifyFBToken',error)
       return res.status(403).send({message: 'forbidden access'})
     }


    }


    //verify email
    let verifyTokenEmail = (req, res, next) => {
    if (req.query.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
    }
    next();
}


    //verify admin
    let verifyAdmin = async(req,res,next)=>{
        let email = req.decoded.email;
        let query = {email};
        let user = await usersCollection.findOne(query);
        if(!user || user.role !=='admin'){
             return res.status(403).send({message: 'forbidden access'})
        }
        next();
    }


    //users


app.get('/users/search',verifyFBToken,verifyAdmin, async (req, res) => {
  const emailQuery = req.query.email;

  if (!emailQuery) {
    return res.status(400).send({ message: "Missing email query" });
  }

  const regex = new RegExp(emailQuery, "i"); // Case-insensitive

  try {
    const users = await usersCollection
      .find({ email: { $regex: regex } })
      .project({
        email: 1,
        name: 1,
        role: 1,
        createdAt: 1,  // ✅ use 'createdAt' not 'created_at'
         photoURL: 1, 
      })
      .limit(10)
      .toArray();

    res.send(users);
  } catch (error) {
    console.error("Error searching users", error);
    res.status(500).send({ message: "Error searching users" });
  }
});

app.get("/users/:email/role", async (req, res) => {
  const email = req.params.email;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const user = await usersCollection.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.send({ email, role: user.role ||'user' });
  } catch (error) {
    console.error("Failed to fetch user role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.get("/users", async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.send(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).send({ error: "Internal Server Error" });
  }
});



app.patch("/users/:id/role",verifyFBToken,verifyAdmin, async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;

  // Validate input
  if (!["admin", "user"].includes(role)) {
    return res.status(400).send({ message: "Invalid role" });
  }

  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { role: role } }
    );

 
    res.send({ message: `Role updated to ${role}`, result});
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).send({ message: "Error updating user role" });
  }
});


    // app.post('/users',async(req,res)=>{
    //     let email = req.body.email;
    //     let userExists = await usersCollection.findOne({email});
    //     if(userExists){
    //     //update last logged in info
    //      return res.send({ message: "User already exists", inserted: false });
    //      }


    //      let user = req.body;
    //      let result = await usersCollection.insertOne(user);
    //      res.send(result)

    // })

//donation payment 
app.post('/users', async (req, res) => {
  try {
    let email = req.body.email;
    let userExists = await usersCollection.findOne({ email });

    if (userExists) {
      // Update lastLoginAt to current time for existing user
      await usersCollection.updateOne(
        { email },
        { $set: { lastLoginAt: new Date().toISOString() } }
      );

      return res.send({ message: "User already exists", inserted: false });
    }

    let user = req.body;
    user.createdAt = new Date().toISOString();
    user.lastLoginAt = new Date().toISOString();

    let result = await usersCollection.insertOne(user);
    res.send(result);
  } catch (error) {
    console.error("Error in /users POST:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});



//donation
app.get("/my-donations",verifyFBToken,verifyTokenEmail, async (req, res) => {
  try {
    console.log('headers in donation',req.headers)

    
    const { donorEmail } = req.query;
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 5;

    if (!donorEmail) {
      return res.status(400).json({ error: "donorEmail query parameter is required" });
    }

    const query = { donorEmail };

    // Count total donations for pagination
    const total = await donationsCollection.countDocuments(query);

    // Paginated donations
    const donations = await donationsCollection
      .find(query)
      .skip(page * limit)
      .limit(limit)
      .sort({ createdAt: -1 })
      .toArray();

    // Enrich each donation with campaign info
    const enrichedDonations = await Promise.all(
      donations.map(async (donation) => {
        const campaign = await donationCampaignsCollection.findOne({
          _id: new ObjectId(donation.campaignId),
        });

        return {
          ...donation,
          petName: campaign?.petName || "Unknown Pet",
          petImage: campaign?.petImage || null,
        };
      })
    );

    res.json({
      donations: enrichedDonations,
      total, // <-- send total count
    });
  } catch (err) {
    console.error("GET /my-donations error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



app.post('/create-payment-intent', async (req, res) => {
      let amountInCents = req.body.amountInCents
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents, // amount in cents
    currency: 'usd',
    automatic_payment_methods: {enabled: true},
  });

  res.json({clientSecret: paymentIntent.client_secret});
});


app.post("/donations", async (req, res) => {
  try {
    const donation = req.body;

    console.log("Received donation:", donation);

    if (
      !donation?.campaignId ||
      !donation?.campaignOwnerEmail ||
      !donation?.donorEmail ||
      !donation?.donorName ||
      !donation?.amount ||
      !donation?.paymentMethodId
    ) {
      return res.status(400).json({ error: "Missing required donation data" });
    }

    // Convert amount to float and timestamp
    donation.amount = parseFloat(donation.amount);
    donation.donatedAt = new Date();

    // ✅ Fetch campaign to check if it's paused
    const campaign = await donationCampaignsCollection.findOne({
      _id: new ObjectId(donation.campaignId),
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign.paused) {
      return res.status(403).json({ error: "This campaign is currently paused." });
    }

    // ✅ Proceed with donation
    const result = await donationsCollection.insertOne(donation);

    await donationCampaignsCollection.updateOne(
      { _id: new ObjectId(donation.campaignId) },
      { $inc: { donatedAmount: donation.amount } }
    );

    res.status(201).send({ insertedId: result.insertedId });
  } catch (err) {
    console.error("Donation POST error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.delete("/donations/:donationId",verifyFBToken, async (req, res) => {
  try {
    const donationId = req.params.donationId;

    // Find the donation to get the amount and campaignId
    const donation = await donationsCollection.findOne({ _id: new ObjectId(donationId) });

    if (!donation) {
      return res.status(404).json({ error: "Donation not found" });
    }

    // Delete the donation
    await donationsCollection.deleteOne({ _id: new ObjectId(donationId) });

    // Subtract the donation amount from the campaign's donatedAmount
    await donationCampaignsCollection.updateOne(
      { _id: new ObjectId(donation.campaignId) },
      { $inc: { donatedAmount: -donation.amount } }
    );

    res.status(200).json({ message: "Donation refunded successfully" });
  } catch (err) {
    console.error("Refund error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



    //adoption request

app.get("/adoptions",verifyFBToken, async (req, res) => {
  const ownerEmail = req.query.ownerEmail;
  console.log(ownerEmail)
  const result = await adoptionsCollection
    .find({ ownerEmail })
    .sort({ requestedAt: -1 })
    .toArray();
  res.send(result);
});

app.patch("/adoptions/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await adoptionsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );

  res.send(result);
});

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

    // Fetch the pet to get the owner email
    const pet = await petsCollection.findOne({ _id: new ObjectId(adoptionData.petId) });
    if (!pet) {
      return res.status(404).json({ error: "Pet not found" });
    }

    // Add ownerEmail to adoptionData before inserting
    adoptionData.ownerEmail = pet.userEmail;

    const result = await adoptionsCollection.insertOne(adoptionData);
    res.status(201).json({ insertedId: result.insertedId });
  } catch (error) {
    console.error("Failed to save adoption:", error);
    res.status(500).json({ error: "Failed to process adoption request" });
  }
});

 //donation campaign

//     app.get("/donation-campaigns", async (req, res) => {
//   try {
//     const filter = {};

//     if (req.query.email) {
//       filter.createdBy = req.query.email;
//     }

//     const campaigns = await donationCampaignsCollection
//       .find(filter)
//       .sort({ createdAt: -1 })
//       .toArray();

//     res.json(campaigns);
//   } catch (err) {
//     console.error("Error fetching campaigns:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

// app.get("/donation-details/:id",verifyFBToken, async (req, res) => {
//   const { id } = req.params;
//   try {
//     const campaign = await donationCampaignsCollection.findOne({ _id: new ObjectId(id) });
//     if (!campaign) return res.status(404).json({ error: "Campaign not found" });
//     res.send(campaign);
//   } catch (error) {
//     res.status(500).json({ error: "Failed to fetch campaign" });
//   }
// });


app.get("/donation-details/:id", async (req, res) => {
  const { id } = req.params;
  try {
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid campaign ID" });
    }

    const campaign = await donationCampaignsCollection.findOne({ _id: new ObjectId(id) });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    res.json(campaign);
  } catch (error) {
    console.error("Failed to fetch campaign:", error);
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

// Get all donators for a specific campaign
app.get("/donation-campaigns/:id/donators",verifyFBToken, async (req, res) => {
  try {
    const campaignId = req.params.id;

    const donations = await donationsCollection
      .find({ campaignId })
      .project({ donorName: 1, amount: 1, _id: 0 })
      .sort({ donatedAt: -1 })
      .toArray();

    res.send(donations);
  } catch (err) {
    console.error("Error fetching donators:", err);
    res.status(500).json({ error: "Failed to fetch donators" });
  }
});

app.get("/donation-campaigns/:id",verifyFBToken, async (req, res) => {
  try {
    const id = req.params.id;
    const campaign = await donationCampaignsCollection.findOne({ _id: new ObjectId(id) });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    res.json(campaign);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// app.get("/donation-campaigns",verifyFBToken, async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 0;
//     const limit = parseInt(req.query.limit) || 6;

//     const campaigns = await donationCampaignsCollection
//       .find({})
//       .sort({ createdAt: -1 })
//       .skip(page * limit)
//       .limit(limit)
//       .toArray();

//     res.json(campaigns);
//   } catch (err) {
//     console.error("Error fetching campaigns:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

app.get("/donation-campaigns",async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 6;
    const excludeId = req.query.exclude;

    let filter = {};
    if (excludeId && ObjectId.isValid(excludeId)) {
      filter._id = { $ne: new ObjectId(excludeId) };
    }

    // Get total count of filtered campaigns
    const total = await donationCampaignsCollection.countDocuments(filter);

    // Get paginated campaigns sorted by newest first
    const campaigns = await donationCampaignsCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(page * limit)
      .limit(limit)
      .toArray();

    res.json({ total, campaigns });
  } catch (err) {
    console.error("Error fetching campaigns:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/all-donation-campaigns", verifyFBToken,verifyAdmin,async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 6;
    const excludeId = req.query.exclude;

    let filter = {};
    if (excludeId && ObjectId.isValid(excludeId)) {
      filter._id = { $ne: new ObjectId(excludeId) };
    }

    // Get total count of filtered campaigns
    const total = await donationCampaignsCollection.countDocuments(filter);

    // Get paginated campaigns sorted by newest first
    const campaigns = await donationCampaignsCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(page * limit)
      .limit(limit)
      .toArray();

    res.json({ total, campaigns });
  } catch (err) {
    console.error("Error fetching campaigns:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



app.patch("/donation-campaigns/:id",verifyFBToken, async (req, res) => {
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

app.get('/my-donations-campaign',verifyFBToken, async (req, res) => {
  try {
    const userEmail = req.query.email;
    if (!userEmail) {
      return res.status(400).json({ error: "Email query parameter is required" });
    }

    const campaigns = await donationCampaignsCollection
      .find({ createdBy: userEmail }) // assuming `createdBy` stores user's email
      .toArray();

    res.json(campaigns);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




app.post("/donation-campaigns",verifyFBToken, async (req, res) => {
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

// DELETE a donation campaign by ID
app.delete("/donation-campaigns/:id",verifyFBToken, async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid campaign ID" });
    }

    const result = await donationCampaignsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    res.json({ message: "Campaign deleted successfully" });
  } catch (err) {
    console.error("Error deleting campaign:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


//pets

    app.post("/pets",verifyFBToken, async (req, res) => {
      try {
       // console.log('headers in pets',req.headers)
        const pet = req.body;
        const result = await petsCollection.insertOne(pet);
        res.status(201).json(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to add pet" });
      }
    });

    // Get all pets

// Admin-only: Get all pets with pagination
app.get("/all-pets", verifyFBToken,verifyAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 10;

    const total = await petsCollection.countDocuments();
    const pets = await petsCollection
      .find({})
      .skip(page * limit)
      .limit(limit)
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ total, pets });
  } catch (err) {
    console.error("Failed to fetch all pets:", err);
    res.status(500).json({ error: "Failed to fetch all pets" });
  }
});



  app.get("/pets", async (req, res) => {
  try {
    const userEmail = req.query.email;
    


    const search = req.query.search || "";
    const category = req.query.category || "";
    const adopted = req.query.adopted === "false";
    const showAll = req.query.all === "true"; // 🆕 NEW flag
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

    // Apply pagination only if all !== true
    const options = {
      sort: { createdAt: -1 },
      ...(showAll
        ? {}
        : {
            skip: page * limit,
            limit: limit,
          }),
    };

    const pets = await petsCollection.find(query, options).toArray();

    res.json(pets);
  } catch (err) {
    console.error("Failed to fetch pets:", err);
    res.status(500).json({ error: "Failed to fetch pets" });
  }
});

// app.get("/my-pets", verifyFBToken, async (req, res) => {
//   try {
//     const userEmail = req.query.email;
//     console.log('user email form my-pets',userEmail)
//     console.log('decoded email form my-pets',req.decoded.email)
//     //console.log('decoded',req.decoded);

//     if(req.decoded.email !==userEmail){
//         return res.status(403).send({message: 'forbidden access'})
//     }

//     const page = parseInt(req.query.page) || 0;
//     const limit = 10; // 🔥 Fixed limit to 10 per page

//     if (!userEmail) {
//       return res.status(400).json({ error: "Email is required" });
//     }

//     const query = { userEmail };

//     const total = await petsCollection.countDocuments(query);
//     const pets = await petsCollection
//       .find(query)
//       .sort({ createdAt: -1 })
//       .skip(page * limit)
//       .limit(limit)
//       .toArray();

//     res.json({ total, pets });
//   } catch (err) {
//     console.error("Failed to fetch user pets:", err);
//     res.status(500).json({ error: "Failed to fetch pets" });
//   }
// });




  // GET /pets/:id - Get a single pet by ID
    

  app.get("/my-pets", verifyFBToken, async (req, res) => {
  try {
    const userEmail = req.decoded.email; // ✅ Use token email only

    const page = parseInt(req.query.page) || 0;
    const limit = 10;

    const query = { userEmail };

    const total = await petsCollection.countDocuments(query);
    const pets = await petsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(page * limit)
      .limit(limit)
      .toArray();

    res.json({ total, pets });
  } catch (err) {
    console.error("Failed to fetch user pets:", err);
    res.status(500).json({ error: "Failed to fetch pets" });
  }
});

  
  
  app.get("/pets/:id",verifyFBToken, async (req, res) => {
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
   app.patch("/pets/:id",verifyFBToken, async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;

    console.log("🔁 PATCH Request to update pet:", id);
    console.log("📝 Update Data:", updateData);

    const result = await petsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    console.log("✅ MongoDB Update Result:", result);

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Pet not found" });
    }

    res.json({ message: "Pet updated" });
  } catch (err) {
    console.error("❌ Update Error:", err);
    res.status(500).json({ error: "Failed to update pet" });
  }
});


app.delete('/pets/:id',verifyFBToken, async (req, res) => {
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

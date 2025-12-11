require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

const serviceAccount = require("./firebaseAdminJdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);

app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.2ok3xcp.mongodb.net/?appName=Cluster0`;
console.log(uri);

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // email, uid, etc.
    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid Token" });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    const database = client.db("Lessonlab");
    const LessonColletion = database.collection("LessonCollection");
    const UserCollection = database.collection("UserCollection");

    app.get("/", (req, res) => {
      res.send("Lesson Lab is coocking.............");
    });

    // ------------------------- USER ROUTES ---------------------------------

    app.post("/register", async (req, res) => {
      try {
        const user = req.body;

        if (!user.email) {
          return res
            .status(400)
            .send({ success: false, message: "Email required" });
        }

        const filter = { email: user.email };
        const update = { $set: user };
        const options = { upsert: true };

        const result = await UserCollection.updateOne(filter, update, options);

        res.send({
          success: true,
          message: "User registered/updated successfully",
          data: result,
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get("/me", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;

        const user = await UserCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ success: true, user });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
    app.put("/update", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const updateData = req.body;

        const result = await UserCollection.updateOne(
          { email },
          { $set: updateData }
        );

        res.send({ success: true, message: "Profile updated", result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // Admin-only: Get all users
    app.get("/alluser", verifyToken, async (req, res) => {
      try {
        const requesterEmail = req.user.email;
        const requester = await UserCollection.findOne({
          email: requesterEmail,
        });

        if (requester?.role !== "admin") {
          return res.status(403).send({ message: "Forbidden (Admin only)" });
        }

        const users = await UserCollection.find().toArray();
        res.send({ success: true, users });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // --------------------------- Lesson Routes ----------------

    app.post("/addlesson", async (req, res) => {
      try {
        const lessonData = req.body;

        // Basic validation
        if (!lessonData.title || !lessonData.description) {
          return res.status(400).send({
            success: false,
            message: "Title and Description are required",
          });
        }
        const result = await LessonColletion.insertOne(lessonData);
        // Fake response for now
        res.send({
          success: true,
          message: "Lesson API triggered successfully",
          data: result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Something went wrong",
          error: error.message,
        });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`LessonLab app listening on port ${port}`);
});

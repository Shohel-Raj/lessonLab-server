require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    const lessonsReports = database.collection("lessonsReports");

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

    app.get("/publicLesson", async (req, res) => {
      try {
        let query = { visibility: "Public" };
        const resut = await LessonColletion.find(query).toArray();
        res.send({ success: true, resut });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
    // GET LESSONS (OWNER → only own lessons, ADMIN → all lessons)
    app.get("/lessons", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;

        // Find requester from database
        const requester = await UserCollection.findOne({ email });

        if (!requester) {
          return res.status(404).send({ message: "User not found" });
        }

        let query = {};

        // If user is not admin, fetch only their lessons
        if (requester.role !== "admin") {
          query = { author_email: email };
        }

        const lessons = await LessonColletion.find(query).toArray();

        res.send({ success: true, lessons });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // GET SINGLE LESSON
    app.get("/lesson/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const lesson = await LessonColletion.findOne({
          _id: new ObjectId(id),
        });

        if (!lesson) {
          return res
            .status(404)
            .send({ success: false, message: "Lesson not found" });
        }

        res.send({ success: true, lesson });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // UPDATE LESSON (OWNER OR ADMIN)
    app.put("/lesson/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body;

        const lesson = await LessonColletion.findOne({
          _id: new ObjectId(id),
        });

        if (!lesson) {
          return res.status(404).send({ message: "Lesson not found" });
        }

        // Find requester from DB
        const requester = await UserCollection.findOne({
          email: req.user.email,
        });

        // Permission Check
        if (
          lesson.author_email !== req.user.email &&
          requester.role !== "admin"
        ) {
          return res.status(403).send({ message: "Forbidden: Not authorized" });
        }

        const result = await LessonColletion.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        res.send({
          success: true,
          message: "Lesson updated successfully",
          result,
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // DELETE LESSON (OWNER OR ADMIN)
    app.delete("/lesson/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        const lesson = await LessonColletion.findOne({
          _id: new ObjectId(id),
        });

        if (!lesson) {
          return res.status(404).send({ message: "Lesson not found" });
        }

        // Find requester from DB
        const requester = await UserCollection.findOne({
          email: req.user.email,
        });

        // Permission Check
        if (
          lesson.author_email !== req.user.email &&
          requester.role !== "admin"
        ) {
          return res.status(403).send({ message: "Forbidden: Not authorized" });
        }

        const result = await LessonColletion.deleteOne({
          _id: new ObjectId(id),
        });

        res.send({
          success: true,
          message: "Lesson deleted successfully",
          result,
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // ------------------------
    // TOGGLE LESSON LIKE / Save to favourite
    // ------------------------
    app.put("/like/:id", verifyToken, async (req, res) => {
      try {
        const lessonId = req.params.id;
        const userEmail = req.user.email;

        // Find the lesson
        const lesson = await LessonColletion.findOne({
          _id: new ObjectId(lessonId),
        });
        if (!lesson) {
          return res
            .status(404)
            .json({ success: false, message: "Lesson not found" });
        }

        lesson.isLiked = lesson.isLiked || [];

        let update;
        if (lesson.isLiked.includes(userEmail)) {
          // Remove like
          update = { $pull: { isLiked: userEmail }, $inc: { likesCount: -1 } };
        } else {
          // Add like
          update = {
            $addToSet: { isLiked: userEmail },
            $inc: { likesCount: 1 },
          };
        }

        const updatedLesson = await LessonColletion.findOneAndUpdate(
          { _id: new ObjectId(lessonId) },
          update,
          { returnDocument: "after" } // MongoDB >=4.4
        );

        res.json({
          success: true,
          message: "Like toggled successfully",
          lesson: updatedLesson,
          likes: updatedLesson.isLiked.includes(userEmail),
        });
      } catch (error) {
        console.error("Toggle like error:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    });
    app.put("/save/:id", verifyToken, async (req, res) => {
      try {
        const lessonId = req.params.id;
        const userEmail = req.user.email;

        // Find the lesson
        const lesson = await LessonColletion.findOne({
          _id: new ObjectId(lessonId),
        });
        if (!lesson) {
          return res
            .status(404)
            .json({ success: false, message: "Lesson not found" });
        }

        lesson.isSaved = lesson.isSaved || [];

        let update;
        if (lesson.isSaved.includes(userEmail)) {
          // Remove from favorites
          update = {
            $pull: { isSaved: userEmail },
            $inc: { saveCount: -1 },
            $set: { updated_at: new Date() },
          };
        } else {
          // Add to favorites
          update = {
            $addToSet: { isSaved: userEmail },
            $inc: { saveCount: 1 },
            $set: { updated_at: new Date() },
          };
        }

        const updatedLesson = await LessonColletion.findOneAndUpdate(
          { _id: new ObjectId(lessonId) },
          update,
          { returnDocument: "after" }
        );

        res.json({
          success: true,
          message: updatedLesson.isSaved.includes(userEmail)
            ? "Added to favorites"
            : "Removed from favorites",
          lesson: updatedLesson,
          isSaved: updatedLesson.isSaved.includes(userEmail),
          saveCount: updatedLesson.saveCount,
        });
      } catch (error) {
        console.error("Toggle save error:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.post("/report/:id", verifyToken, async (req, res) => {
      try {
        const lessonId = req.params.id;
        const userEmail = req.user.email; // reporter email
        const { reason } = req.body;

        if (!reason) {
          return res.json({ success: false, message: "Reason is required" });
        }

        const reportEntry = {
          lessonId: new ObjectId(lessonId),
          reporterEmail: userEmail,
          reason: reason,
          timestamp: new Date(),
        };

        // Insert into lessonReports collection
        const result = await lessonsReports.insertOne(reportEntry);

        res.json({
          success: true,
          message: "Lesson reported successfully",
          reportId: result.insertedId,
        });
      } catch (error) {
        console.error("Report error:", error);
        res.status(500).json({ success: false, message: "Server error" });
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

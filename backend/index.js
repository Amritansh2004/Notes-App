require("dotenv").config();

const config = require("./config.json");
const mongoose = require("mongoose");

// Connect to MongoDB
mongoose
  .connect(config.connectionString, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB:", err));

const User = require("./models/user.model");
const Note = require("./models/notes.model");

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { authenticateToken } = require("./utilities"); 

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: "*",
  })
);

app.get("/", (req, res) => {
  res.json({ data: "hello" });
});

// API of the Backend

// Create Account
app.post("/createAccount", async (req, res) => {
    const { fullName, email, password } = req.body;
  
    if (!fullName) {
      return res.status(400).json({ message: "Please enter your full name" });
    }
    if (!email) {
      return res.status(400).json({ message: "Please enter your email" });
    }
    if (!password) {
      return res.status(400).json({ message: "Please enter your password" });
    }
  
    try {
      const isUser = await User.findOne({ email });
      if (isUser) {
        return res.status(400).json({
          error: true,
          message: "User already exists",
        });
      }
  
      const user = new User({ fullName, email, password });
      await user.save();
  
      const accessToken = jwt.sign(
        { userId: user._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "36000m" }
      );
  
      return res.status(201).json({
        error: false,
        user, 
        accessToken,
        message: "Registration Successful",
      });
    } catch (error) {
      console.error("Error creating account:", error.message); 
      return res.status(500).json({
        error: true,
        message: "An error occurred. Please try again later.",
      });
    }
  });
  
// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if(!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  if(!password) {
    return res.status(400).json({ message: "Password is required" });
  }

  const userInfo = await User.findOne({ email: email});

  if(!userInfo) {
    return res.status(400).json({ message: "User not found" });
  }

  if (userInfo.email == email && userInfo.password == password) {
    const user = {user: userInfo};
    const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "36000m",
    });

    return res.json({
      error: false,
      message: "Login Successful",
      email,
      accessToken,
    });
  } else {
    return res.status(400).json({ 
      error: true,
      message: "Invalid email or password",
     });
  }
});

// Get User
app.get("/get-user", authenticateToken, async (req, res) => {
  const user = req.user.user;
  const isUser = await User.findOne({_id: user._id});

  if(!isUser) {
    return res.status(400).json({ message: "User not found" });
  }

  return res.json ({
    User: {fullName: isUser.fullName, email: isUser.email, "_id": isUser._id, createdOn: isUser.createdOn},
    message: "",
  });
});

// Add Note
app.post("/add-note", authenticateToken, async (req, res) => {
  const { title, content, tags } = req.body;

  const user = req.user.user; 

  if (!title) {
    return res.status(400).json({ error: true, message: "Title is required" });
  }

  if (!content) {
    return res.status(400).json({ error: true, message: "Content is required" });
  }

  try {
    const note = new Note({
      title,
      content,
      tags: tags || [],
      userId: user._id, // Use user._id from token
    });

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Note added successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
});

// Edit Note
app.put("/edit-note/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { title, content, tags, isPinned } = req.body;
  const user = req.user.user;

  if (!mongoose.Types.ObjectId.isValid(noteId)) {
    return res.status(400).json({ error: true, message: "Invalid noteId format" });
  }

  if (!title && !content && !tags) {
    return res.status(400).json({ error: true, message: "No changes provided" });
  }

  try {
    console.log("Finding Note with Query:", { _id: noteId, userId: user._id });
    const note = await Note.findOne({ _id: noteId, userId: user._id });

    if (!note) {
      return res.status(404).json({
        error: true,
        message: "Note not found",
        debug: { noteId, userId: user._id },
      });
    }

    if (title) note.title = title;
    if (content) note.content = content;
    if (tags) note.tags = tags;
    if (typeof isPinned !== "undefined") note.isPinned = isPinned;

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Note updated successfully",
    });
  } catch (error) {
    console.error("Error updating note:", error.message);
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
});

// Get All Notes
app.get("/get-all-notes/", authenticateToken, async (req, res) => {
  const user  = req.user.user;
  try {
    const notes = await Note.find({ userId: user._id }).populate("tags").sort({ isPinned: -1});

    return res.json ({
      error: false,
      notes,
      message: " All Notes retrieved successfully",
    });

  } catch(error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
});

// Delete Note
app.delete("/delete-note/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const user = req.user.user; 

  if (!mongoose.Types.ObjectId.isValid(noteId)) {
    return res.status(400).json({ error: true, message: "Invalid noteId format" });
  }

  try {
    const note = await Note.findOne({ _id: noteId, userId: user._id });

    if (!note) {
      return res.status(404).json({ error: true, message: "Note not found" });
    }

    await Note.deleteOne({ _id: noteId, userId: user._id });

    return res.json({
      error: false,
      message: "Note deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting note:", error.message);
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
});

// Update isPinned Value
app.put("/update-note-pinned/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { isPinned } = req.body;
  const user = req.user.user;

  if (!mongoose.Types.ObjectId.isValid(noteId)) {
    return res.status(400).json({ error: true, message: "Invalid noteId format" });
  }

  if (typeof isPinned !== "boolean") {
    return res.status(400).json({
      error: true,
      message: "Invalid value for isPinned. Must be a boolean.",
    });
  }

  try {
    console.log("Finding Note with Query:", { _id: noteId, userId: user._id });
    const note = await Note.findOne({ _id: noteId, userId: user._id });

    if (!note) {
      return res.status(404).json({
        error: true,
        message: "Note not found",
        debug: { noteId, userId: user._id },
      });
    }

    note.isPinned = isPinned;

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Note updated successfully",
    });
  } catch (error) {
    console.error("Error updating note:", error.message);
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
});

// Start server
app.listen(8000, () => {
  console.log("Server is running on http://localhost:8000");
});

module.exports = app;

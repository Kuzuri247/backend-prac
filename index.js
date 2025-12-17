import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { User } from "./models/user.js";
import { Class } from "./models/class.js";
import { Attendance } from "./models/attendance.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/attendance-system")
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log(err));

let activeSession = null;

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET || "secret", { expiresIn: '1d' });
};

const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization"); 
    if (!token) throw new Error("Unauthorized, token missing or invalid");

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      error: "Unauthorized, token missing or invalid",
    });
  }
};

app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    if (!name || !email || !password || !role)
      return res.status(400).json({ success: false, error: "Invalid request schema" });
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ success: false, error: "Invalid request schema" });
    
    if (password.length < 6)
      return res.status(400).json({ success: false, error: "Invalid request schema" });
    if (!["student", "teacher"].includes(role)) 
      return res.status(400).json({ success: false, error: "Invalid request schema" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ success: false, error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
    });

    const userRw = user.toObject();
    delete userRw.password;
    res.status(201).json({ success: true, data: userRw });
  } catch (err) {
    res.status(400).json({ success: false, error: "Invalid request schema" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password)
      return res.status(400).json({ success: false, error: "Invalid request schema" });
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ success: false, error: "Invalid request schema" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ success: false, error: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ success: false, error: "Invalid email or password" });

    const token = generateToken(user._id, user.role);
    res.json({ success: true, data: { token } });
  } catch (err) {
    res.status(400).json({ success: false, error: "Invalid request schema" });
  }
});

app.get("/auth/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) return res.status(401).json({ success: false, error: "User not found" });
  res.json({ success: true, data: user });
});

app.post("/class", auth, async (req, res) => {
  if (req.user.role !== "teacher") 
    return res.status(403).json({ success: false, error: "Forbidden, teacher access required" });

  if (!req.body.className)
    return res.status(400).json({ success: false, error: "Invalid request schema" });

  const newClass = await Class.create({
    className: req.body.className,
    teacherId: req.user.id,
    studentIds: [],
  });

  res.status(201).json({ success: true, data: newClass });
});

app.post("/class/:id/add-student", auth, async (req, res) => {
  if (req.user.role !== "teacher")
    return res.status(403).json({ success: false, error: "Forbidden, teacher access required" });

  if (!req.body.studentId)
    return res.status(400).json({ success: false, error: "Invalid request schema" });

  try {
    const classObj = await Class.findById(req.params.id);
    if (!classObj) return res.status(404).json({ success: false, error: "Class not found" });

    if (classObj.teacherId.toString() !== req.user.id)
      return res.status(403).json({ success: false, error: "Forbidden, not class teacher" });
    
    const student = await User.findById(req.body.studentId);
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });

    if (!classObj.studentIds.some(id => id.toString() === req.body.studentId)) {
      classObj.studentIds.push(req.body.studentId);
      await classObj.save();
    }

    const responseData = classObj.toObject();
    res.json({ success: true, data: responseData });
  } catch (err) {
    res.status(404).json({ success: false, error: "Class not found" });
  }
});

app.get("/class/:id", auth, async (req, res) => {
  try {
    const classObj = await Class.findById(req.params.id).populate("studentIds", "name email");
    if (!classObj) return res.status(404).json({ success: false, error: "Class not found" });

    const isTeacher = classObj.teacherId.toString() === req.user.id;
    const isStudent = classObj.studentIds.some((s) => s._id.toString() === req.user.id);

    if (req.user.role === "teacher" && !isTeacher)
      return res.status(403).json({ success: false, error: "Forbidden, not class teacher" });

    if (req.user.role === "student" && !isStudent)
      return res.status(403).json({ success: false, error: "Forbidden, not class teacher" });

    const responseData = classObj.toObject();
    responseData.students = isTeacher ? classObj.studentIds : undefined;
    res.json({ success: true, data: responseData });
  } catch (err) {
    res.status(404).json({ success: false, error: "Class not found" });
  }
});

app.get("/students", auth, async (req, res) => {
  if (req.user.role !== "teacher")
    return res.status(403).json({ success: false, error: "Forbidden, teacher access required" });

  const students = await User.find({ role: "student" }).select("-password");
  res.json({ success: true, data: students });
});

app.post("/attendance/start", auth, async (req, res) => {
  if (req.user.role !== "teacher")
    return res.status(403).json({ success: false, error: "Forbidden, teacher access required" });

  if (!req.body.classId)
    return res.status(400).json({ success: false, error: "Invalid request schema" });

  try {
    const classObj = await Class.findById(req.body.classId);
    if (!classObj) return res.status(404).json({ success: false, error: "Class not found" });

    if (classObj.teacherId.toString() !== req.user.id)
      return res.status(403).json({ success: false, error: "Forbidden, not class teacher" });

    // ✅ FIX: Clear any existing session
    activeSession = {
      classId: classObj._id,
      startedAt: new Date(),
      attendance: {},
    };

    res.json({ success: true, data: activeSession });
  } catch (err) {
    res.status(404).json({ success: false, error: "Class not found" });
  }
});

app.get('/class/:id/my-attendance', auth, async (req, res) => {
  if (req.user.role !== 'student')
    return res.status(403).json({ success: false, error: 'Forbidden, student access required' });

  try {
    const classObj = await Class.findById(req.params.id);
    if (!classObj) return res.status(404).json({ success: false, error: 'Class not found' });

    if (!classObj.studentIds.includes(req.user.id))
      return res.status(403).json({ success: false, error: 'Forbidden, not enrolled in class' });
    
    const record = await Attendance.findOne({ classId: req.params.id }).sort({ date: -1 });
    let status = null;
    
    if (record) {
      const studentRecord = record.records.find(r => r.studentId.toString() === req.user.id);
      if (studentRecord) status = studentRecord.status;
    }

    res.json({ success: true, data: { classId: req.params.id, status } });
  } catch (e) {
    res.status(404).json({ success: false, error: 'Class not found' });
  }
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", async (ws, req) => {
  const urlParams = new URLSearchParams(req.url.split("?")[1]);
  const token = urlParams.get("token");

  try {
    if (!token) throw new Error("No token");
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    ws.user = decoded;
  } catch (err) {
    ws.send(JSON.stringify({ event: "ERROR", data: { message: "Unauthorized or invalid token" } }));
    return ws.terminate();
  }

  ws.on("message", async (message) => {
    try {
      const parsed = JSON.parse(message);
      const { event, data } = parsed;

      if (event === "ATTENDANCE_MARKED") {
        if (ws.user.role !== "teacher") {
          return ws.send(JSON.stringify({ event: "ERROR", data: { message: "Forbidden, teacher event only" } }));
        }
        // ✅ FIX: Remove the Map logic, use simple activeSession
        if (!activeSession) {
          return ws.send(JSON.stringify({ event: "ERROR", data: { message: "No active attendance session" } }));
        }

        activeSession.attendance[data.studentId] = data.status;

        ws.send(JSON.stringify({ event: "ATTENDANCE_MARKED", data: { studentId: data.studentId, status: data.status } }));

        wss.clients.forEach((client) => {
          if (client.readyState === 1 && client.user && client.user.id === data.studentId) {
            client.send(JSON.stringify({ event: "ATTENDANCE_MARKED", data: { status: data.status } }));
          }
        });
      }
      
      else if (event === "MY_ATTENDANCE") {
        if (ws.user.role !== "student") {
          return ws.send(JSON.stringify({ event: "ERROR", data: { message: "Forbidden, student event only" } }));
        }
        if (!activeSession) {
          return ws.send(JSON.stringify({ event: "ERROR", data: { message: "No active attendance session" } }));
        }
        const status = activeSession.attendance[ws.user.id] || "not yet updated";
        ws.send(JSON.stringify({ event: "MY_ATTENDANCE", data: { status } }));
      }

      else if (event === "TODAY_SUMMARY") {
        if (ws.user.role !== "teacher") {
          return ws.send(JSON.stringify({ event: "ERROR", data: { message: "Forbidden, teacher event only" } }));
        }
        if (!activeSession) {
          return ws.send(JSON.stringify({ event: "ERROR", data: { message: "No active attendance session" } }));
        }

        const statuses = Object.values(activeSession.attendance);
        const present = statuses.filter(s => s === 'present').length;
        const absent = statuses.filter(s => s === 'absent').length;
        
        const summaryData = { present, absent, total: present + absent };

        wss.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ event: 'TODAY_SUMMARY', data: summaryData }));
          }
        });
      }

      else if (event === "DONE") {
        if (ws.user.role !== "teacher") {
          return ws.send(JSON.stringify({ event: "ERROR", data: { message: "Forbidden, teacher event only" } }));
        }
        if (!activeSession) {
          return ws.send(JSON.stringify({ event: "ERROR", data: { message: "No active attendance session" } }));
        }

        const classObj = await Class.findById(activeSession.classId);
        
        const finalRecords = classObj.studentIds.map((studentId) => {
          const sid = studentId.toString();
          return {
            studentId: studentId,
            status: activeSession.attendance[sid] || "absent",
          };
        });

        await Attendance.create({
          classId: activeSession.classId,
          records: finalRecords, 
        });

        const present = finalRecords.filter(r => r.status === 'present').length;
        const absent = finalRecords.filter(r => r.status === 'absent').length;
        
        const summaryData = { message: 'Attendance persisted', present, absent, total: present + absent };

        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ event: "DONE", data: summaryData }));
          }
        });

        activeSession = null;
      } 
      
      else {
        ws.send(JSON.stringify({ event: "ERROR", data: { message: "Unknown event" } }));
      }

    } catch (err) {
      ws.send(JSON.stringify({ event: "ERROR", data: { message: "Invalid message format" } }));
    }
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});

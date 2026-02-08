const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'abcd', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'player', 'display'], default: 'player' },
  score: { type: Number, default: 0 },
  online: { type: Boolean, default: true },
  avatar: { type: String }
});

const User = mongoose.model('User', userSchema);

// Question Schema
const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  hint: { type: String, default: '' },
  order: { type: Number, required: true },
  weightage: { type: Number, default: 1 } // ADD THIS LINE
});

const Question = mongoose.model('Question', questionSchema);

// Game State
let gameState = {
  phase: 'waiting', // waiting, question, judging
  currentQuestionIndex: 0,
  currentQuestion: null,
  answers: [],
  players: [],
  timer: null,
  timeLeft: 30,
  timerPaused: false

};

let timerInterval = null;

// Initialize default questions if none exist
async function initializeQuestions() {
  const count = await Question.countDocuments();
  if (count === 0) {
    const defaultQuestions = [
      { question: 'What is the capital of France?', hint: 'City of Love', order: 1 },
      { question: 'Who painted the Mona Lisa?', hint: 'Renaissance artist', order: 2 },
      { question: 'What is the largest planet in our solar system?', hint: 'Gas giant', order: 3 },
      { question: 'In what year did World War II end?', hint: '194_', order: 4 },
      { question: 'What is the chemical symbol for gold?', hint: 'Two letters', order: 5 }
    ];
    await Question.insertMany(defaultQuestions);
    console.log('Default questions initialized');
  }
}

initializeQuestions();

// Helper Functions
async function broadcastGameState() {
  const users = await User.find({ online: true });
  gameState.players = users;
  io.emit('gameStateUpdate', gameState);
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  gameState.timeLeft = 30;
  gameState.timerPaused = false;
  io.emit('timerUpdate', gameState.timeLeft);
  io.emit('timerPausedUpdate', gameState.timerPaused);

  timerInterval = setInterval(() => {
    if (!gameState.timerPaused) {  // ONLY TICK IF NOT PAUSED
      gameState.timeLeft--;
      io.emit('timerUpdate', gameState.timeLeft);

      if (gameState.timeLeft <= 0) {
        clearInterval(timerInterval);
        endQuestion();
      }
    }
  }, 1000);
}


async function endQuestion() {
  if (timerInterval) clearInterval(timerInterval);
  gameState.phase = 'judging';
  await broadcastGameState();
}

// Socket.io Events
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', async (name) => {
    try {
      let user = await User.findOne({ name });

      if (!user) {
        // Create new user
        let role = 'player';
        if (name.toLowerCase() === 'lappy') {
          role = 'display';
        } else {
          const adminExists = await User.findOne({ role: 'admin' });
          if (!adminExists) {
            role = 'admin';
          }
        }

        user = new User({
          name,
          role,
          online: true,
          avatar: `/images/${name}.png` // This will work if the file exists in React's public/images/
        });
        await user.save();
      } else {
        user.online = true;
        await user.save();
      }

      socket.userId = user._id.toString();
      socket.emit('userJoined', user);
      await broadcastGameState();
    } catch (error) {
      console.error('Join error:', error);
    }
  });

  socket.on('rejoin', async (name) => {
    try {
      const user = await User.findOne({ name });
      if (user) {
        user.online = true;
        await user.save();
        socket.userId = user._id.toString();
        socket.emit('userJoined', user);
        await broadcastGameState();
      }
    } catch (error) {
      console.error('Rejoin error:', error);
    }
  });

  socket.on('startGame', async () => {
    try {
      const questions = await Question.find().sort({ order: 1 });
      if (questions.length === 0) return;

      gameState.phase = 'question';
      gameState.currentQuestionIndex = 0;
      gameState.currentQuestion = questions[0];
      gameState.answers = [];

      // Reset scores
      await User.updateMany({}, { score: 0 });

      await broadcastGameState();
      startTimer();
    } catch (error) {
      console.error('Start game error:', error);
    }
  });

  socket.on('submitAnswer', async ({ userId, answer }) => {
    try {
      const existingAnswer = gameState.answers.find(a => a.playerId === userId);
      if (!existingAnswer) {
        gameState.answers.push({
          playerId: userId,
          answer: answer.trim(),
          judged: false,
          isCorrect: false
        });
        await broadcastGameState();

        // Check if all players answered
        const players = await User.find({ role: 'player', online: true });
        if (gameState.answers.length === players.length) {
          await endQuestion();
        }
      }
    } catch (error) {
      console.error('Submit answer error:', error);
    }
  });

  socket.on('endQuestion', async () => {
    await endQuestion();
  });

  socket.on('judgeAnswer', async ({ playerId, isCorrect }) => {
    try {
      const answer = gameState.answers.find(a => a.playerId === playerId);
      if (answer && !answer.judged) {
        answer.judged = true;
        answer.isCorrect = isCorrect;

        if (isCorrect) {
          // ADD WEIGHTAGE - use current question's weightage
          const points = gameState.currentQuestion.weightage || 1;
          await User.findByIdAndUpdate(playerId, { $inc: { score: points } });
        }

        // REFRESH players with updated scores
        const updatedUsers = await User.find({ online: true });
        gameState.players = updatedUsers;

        await broadcastGameState();
      }
    } catch (error) {
      console.error('Judge answer error:', error);
    }
  });

  socket.on('nextQuestion', async () => {
    try {
      const questions = await Question.find().sort({ order: 1 });
      gameState.currentQuestionIndex++;

      if (gameState.currentQuestionIndex < questions.length) {
        gameState.phase = 'question';
        gameState.currentQuestion = questions[gameState.currentQuestionIndex];
        gameState.answers = [];
        await broadcastGameState();
        startTimer();
      } else {
        // Game over
        gameState.phase = 'waiting';
        gameState.currentQuestionIndex = 0;
        gameState.currentQuestion = null;
        gameState.answers = [];
        await broadcastGameState();
      }
    } catch (error) {
      console.error('Next question error:', error);
    }
  });

  socket.on('toggleTimer', async () => {
    try {
      gameState.timerPaused = !gameState.timerPaused;
      io.emit('timerPausedUpdate', gameState.timerPaused);
      console.log(`Timer ${gameState.timerPaused ? 'paused' : 'resumed'}`);
    } catch (error) {
      console.error('Toggle timer error:', error);
    }
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    if (socket.userId) {
      await User.findByIdAndUpdate(socket.userId, { online: false });
      await broadcastGameState();
    }
  });
});

// REST API Routes (for managing questions)
app.get('/api/questions', async (req, res) => {
  try {
    const questions = await Question.find().sort({ order: 1 });
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/questions', async (req, res) => {
  try {
    const { question, hint } = req.body;
    const maxOrder = await Question.findOne().sort({ order: -1 });
    const order = maxOrder ? maxOrder.order + 1 : 1;

    const newQuestion = new Question({ question, hint: hint || '', order });
    await newQuestion.save();
    res.json(newQuestion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: 'Question deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reset', async (req, res) => {
  try {
    await User.deleteMany({});
    gameState = {
      phase: 'waiting',
      currentQuestionIndex: 0,
      currentQuestion: null,
      answers: [],
      players: [],
      timer: null,
      timeLeft: 30,
      timerPaused: false
    };
    res.json({ message: 'Game reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🎮 Quiz Party server running on port ${PORT}`);
});
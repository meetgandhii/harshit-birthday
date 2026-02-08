import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

let socket;
if (typeof window !== 'undefined') {
  socket = io('http://localhost:3001', {
    transports: ['websocket', 'polling']
  });
}

export default function QuizParty() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [gameState, setGameState] = useState(null);
  const [myAnswer, setMyAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerPaused, setTimerPaused] = useState(false);

  useEffect(() => {
    // Check localStorage for existing user
    const savedName = localStorage.getItem('quizName');
    if (savedName) {
      socket.emit('rejoin', savedName);
    }

    socket.on('userJoined', (userData) => {
      setUser(userData);
      localStorage.setItem('quizName', userData.name);
    });

    socket.on('gameStateUpdate', (state) => {
      setGameState(state);
    });

    socket.on('timerUpdate', (time) => {
      setTimeLeft(time);
    });

    socket.on('timerPausedUpdate', (isPaused) => {
      setTimerPaused(isPaused);
    });

    return () => {
      socket.off('userJoined');
      socket.off('gameStateUpdate');
      socket.off('timerUpdate');
      socket.off('timerPausedUpdate');
    };
  }, []); // FIXED: Empty dependency array

  // SEPARATE useEffect to sync user score
  useEffect(() => {
    if (gameState && user) {
      const updatedUser = gameState.players.find(p => p._id === user._id);
      if (updatedUser && updatedUser.score !== user.score) {
        setUser(prevUser => ({ ...prevUser, score: updatedUser.score }));
      }
    }
  }, [gameState]); // Only watch gameState

  const handleJoin = () => {
    if (name.trim()) {
      socket.emit('join', name.trim());
    }
  };

  const handleStartGame = () => {
    socket.emit('startGame');
  };

  const handleSubmitAnswer = () => {
    if (myAnswer.trim()) {
      socket.emit('submitAnswer', { userId: user._id, answer: myAnswer });
      setMyAnswer('');
    }
  };

  const handleEndQuestion = () => {
    socket.emit('endQuestion');
  };

  const handleJudgeAnswer = (playerId, isCorrect) => {
    socket.emit('judgeAnswer', { playerId, isCorrect });
  };

  const handleNextQuestion = () => {
    socket.emit('nextQuestion');
  };

  const handleToggleTimer = () => {
    socket.emit('toggleTimer');
  };

  // Login Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full transform hover:scale-105 transition-transform">
          <h1 className="text-5xl font-black text-center mb-2 bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text">
            QUIZ PARTY! 🎉
          </h1>
          <p className="text-center text-gray-600 mb-6">Enter your name to join the fun!</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="Your awesome name..."
            className="w-full px-4 py-3 rounded-xl border-2 border-purple-300 focus:border-purple-500 focus:outline-none text-lg mb-4"
          />
          <button
            onClick={handleJoin}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 rounded-xl hover:from-purple-600 hover:to-pink-600 transform hover:scale-105 transition-all"
          >
            LET'S GO! 🚀
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) return <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center"><div className="text-white text-2xl">Loading...</div></div>;

  // Display View (for TV/Screen)
  if (user.role === 'display') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-8">
        <h1 className="text-6xl font-black text-white text-center mb-8 drop-shadow-lg">
          🎮 QUIZ PARTY 🎮
        </h1>

        {gameState.phase === 'waiting' && (
          <div className="text-center">
            <p className="text-3xl text-white mb-8">Waiting for admin to start...</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {gameState.players.map((p) => (
                <div key={p._id} className="bg-white/20 backdrop-blur-lg rounded-2xl p-6 text-white">
                  {p.avatar ? (
                    <img 
                      src={p.avatar} 
                      alt={p.name} 
                      className="w-16 h-16 rounded-full mx-auto mb-2 border-2 border-white object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full mx-auto mb-2 border-2 border-white bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-3xl font-bold">
                      {p.name[0].toUpperCase()}
                    </div>
                  )}
                  <div className="text-xl font-bold">{p.name}</div>
                  <div className="text-sm opacity-75">{p.role}</div>
                  <div className="text-lg font-bold mt-2">🏆 {p.score}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {gameState.phase === 'question' && gameState.currentQuestion && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl p-8 mb-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <span className="text-2xl font-bold text-purple-600">
                  Question {gameState.currentQuestionIndex + 1}
                </span>
                <span className={`text-3xl font-black ${timerPaused ? 'text-gray-500' : 'text-orange-500'}`}>
                  {timerPaused ? '⏸️' : '⏱️'} {timeLeft}s
                </span>
              </div>
              <p className="text-3xl font-bold text-gray-800 mb-4">
                {gameState.currentQuestion.question}
              </p>
              {gameState.currentQuestion.hint && (
                <p className="text-lg text-purple-600 italic">💡 Hint: {gameState.currentQuestion.hint}</p>
              )}
            </div>

            <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
              {gameState.players.filter(p => p.role === 'player').map((p) => {
                const hasAnswered = gameState.answers.some(a => a.playerId === p._id);
                return (
                  <div
                    key={p._id}
                    className={`rounded-2xl p-4 text-center transition-all ${
                      hasAnswered ? 'bg-green-400 scale-105' : 'bg-white/30 backdrop-blur-lg'
                    }`}
                  >
                    {p.avatar ? (
                      <img 
                        src={p.avatar} 
                        alt={p.name} 
                        className="w-12 h-12 rounded-full mx-auto mb-2 border-2 border-white object-cover"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full mx-auto mb-2 border-2 border-white bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-2xl font-bold">
                        {p.name[0].toUpperCase()}
                      </div>
                    )}
                    <div className="text-white font-bold">{p.name}</div>
                    {hasAnswered && <div className="text-2xl">✅</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {gameState.phase === 'judging' && gameState.currentQuestion && (
          <div className="max-w-6xl mx-auto">
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl p-8 mb-6 shadow-2xl">
              <p className="text-3xl font-bold text-gray-800 mb-4">
                {gameState.currentQuestion.question}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {gameState.answers.map((ans) => {
                const player = gameState.players.find(p => p._id === ans.playerId);
                return (
                  <div
                    key={ans.playerId}
                    className={`rounded-2xl p-6 ${
                      ans.judged
                        ? ans.isCorrect ? 'bg-green-400' : 'bg-red-400'
                        : 'bg-white/90'
                    } backdrop-blur-lg shadow-lg`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {player.avatar ? (
                          <img 
                            src={player.avatar} 
                            alt={player.name} 
                            className="w-12 h-12 rounded-full border-2 border-white object-cover"
                            onError={(e) => e.target.style.display = 'none'}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full border-2 border-white bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-2xl font-bold">
                            {player.name[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-xl">{player.name}</div>
                          <div className="text-lg mt-1">{ans.answer}</div>
                        </div>
                      </div>
                      {ans.judged && (
                        <div className="text-5xl">
                          {ans.isCorrect ? '✅' : '❌'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Admin View
  if (user.role === 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl font-black text-white text-center mb-4 drop-shadow-lg">
            🎯 ADMIN CONTROL
          </h1>
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 mb-4 text-white text-center">
            <span className="text-2xl font-bold">Players: {gameState.players.filter(p => p.role === 'player').length}</span>
          </div>

          {gameState.phase === 'waiting' && (
            <div className="text-center">
              <div className="grid grid-cols-2 gap-4 mb-6">
                {gameState.players.map((p) => (
                  <div key={p._id} className="bg-white rounded-2xl p-4">
                    {p.avatar ? (
                      <img 
                        src={p.avatar} 
                        alt={p.name} 
                        className="w-12 h-12 rounded-full mx-auto mb-2 border-2 border-gray-300 object-cover"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full mx-auto mb-2 border-2 border-gray-300 bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-2xl font-bold">
                        {p.name[0].toUpperCase()}
                      </div>
                    )}
                    <div className="font-bold text-xl">{p.name}</div>
                    <div className="text-sm text-gray-600">{p.role}</div>
                    <div className="text-lg font-bold text-purple-600">Score: {p.score}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleStartGame}
                className="bg-gradient-to-r from-green-400 to-blue-500 text-white font-black text-2xl py-4 px-8 rounded-2xl hover:scale-110 transform transition-all shadow-xl"
              >
                START GAME! 🚀
              </button>
            </div>
          )}

          {gameState.phase === 'question' && gameState.currentQuestion && (
            <div>
              <div className="bg-white rounded-3xl p-6 mb-6 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-2xl font-bold text-purple-600">
                    Q{gameState.currentQuestionIndex + 1}
                  </span>
                  <span className={`text-3xl font-black ${timerPaused ? 'text-gray-500' : 'text-orange-500'}`}>
                    {timerPaused ? '⏸️' : '⏱️'} {timeLeft}s
                  </span>
                </div>
                <p className="text-2xl font-bold mb-2">{gameState.currentQuestion.question}</p>
                {gameState.currentQuestion.hint && (
                  <p className="text-purple-600 italic">💡 {gameState.currentQuestion.hint}</p>
                )}
              </div>

              <div className="flex gap-3 mb-4">
                <button
                  onClick={handleToggleTimer}
                  className={`flex-1 ${
                    timerPaused
                      ? 'bg-green-500 hover:bg-green-600'
                      : 'bg-yellow-500 hover:bg-yellow-600'
                  } text-white font-bold text-lg py-3 rounded-2xl transition-colors`}
                >
                  {timerPaused ? '▶️ RESUME' : '⏸️ PAUSE'}
                </button>
                <button
                  onClick={handleEndQuestion}
                  className="flex-1 bg-orange-500 text-white font-bold text-lg py-3 rounded-2xl hover:bg-orange-600"
                >
                  END & JUDGE
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {gameState.players.filter(p => p.role === 'player').map((p) => {
                  const hasAnswered = gameState.answers.some(a => a.playerId === p._id);
                  return (
                    <div
                      key={p._id}
                      className={`rounded-xl p-3 text-center ${
                        hasAnswered ? 'bg-green-400' : 'bg-white/50'
                      }`}
                    >
                      {p.avatar ? (
                        <img 
                          src={p.avatar} 
                          alt={p.name} 
                          className="w-10 h-10 rounded-full mx-auto mb-2 border-2 border-white object-cover"
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full mx-auto mb-2 border-2 border-white bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-xl font-bold">
                          {p.name[0].toUpperCase()}
                        </div>
                      )}
                      <div className="font-bold">{p.name}</div>
                      {hasAnswered && <div className="text-xl">✅</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {gameState.phase === 'judging' && gameState.currentQuestion && (
            <div>
              <div className="bg-white rounded-3xl p-6 mb-6 shadow-xl">
                <p className="text-2xl font-bold">{gameState.currentQuestion.question}</p>
              </div>

              <div className="space-y-4 mb-6">
                {gameState.answers.map((ans) => {
                  const player = gameState.players.find(p => p._id === ans.playerId);
                  return (
                    <div
                      key={ans.playerId}
                      className={`rounded-2xl p-4 ${
                        ans.judged
                          ? ans.isCorrect ? 'bg-green-400' : 'bg-red-400'
                          : 'bg-white'
                      } shadow-lg`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-bold text-lg">{player.name}</div>
                          <div className="text-xl mt-1">{ans.answer}</div>
                        </div>
                        {!ans.judged && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleJudgeAnswer(ans.playerId, true)}
                              className="bg-green-500 text-white px-6 py-2 rounded-xl font-bold hover:bg-green-600"
                            >
                              ✅ RIGHT
                            </button>
                            <button
                              onClick={() => handleJudgeAnswer(ans.playerId, false)}
                              className="bg-red-500 text-white px-6 py-2 rounded-xl font-bold hover:bg-red-600"
                            >
                              ❌ WRONG
                            </button>
                          </div>
                        )}
                        {ans.judged && (
                          <div className="text-4xl">
                            {ans.isCorrect ? '✅' : '❌'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {gameState.answers.every(a => a.judged) && (
                <button
                  onClick={handleNextQuestion}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black text-xl py-4 rounded-2xl hover:scale-105 transform transition-all"
                >
                  NEXT QUESTION! 🎯
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Player View
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-400 via-blue-500 to-purple-600 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 mb-4 text-white text-center">
          {user.avatar ? (
            <img 
              src={user.avatar} 
              alt={user.name} 
              className="w-24 h-24 rounded-full mx-auto mb-2 border-4 border-white object-cover"
              onError={(e) => e.target.style.display = 'none'}
            />
          ) : (
            <div className="w-24 h-24 rounded-full mx-auto mb-2 border-4 border-white bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-4xl font-bold">
              {user.name[0].toUpperCase()}
            </div>
          )}
          <h2 className="text-3xl font-black mb-2">{user.name}</h2>
          <div className="text-2xl font-bold">Score: {user.score} 🏆</div>
        </div>

        {gameState.phase === 'waiting' && (
          <div className="bg-white rounded-3xl p-8 text-center shadow-xl">
            <div className="text-6xl mb-4">⏳</div>
            <p className="text-2xl font-bold text-gray-800">Waiting for game to start...</p>
            <p className="text-gray-600 mt-2">Get ready to show your knowledge!</p>
          </div>
        )}

        {gameState.phase === 'question' && gameState.currentQuestion && (
          <div>
            <div className="bg-white rounded-3xl p-6 mb-6 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xl font-bold text-purple-600">
                  Question {gameState.currentQuestionIndex + 1}
                </span>
                <span className={`text-3xl font-black ${timerPaused ? 'text-gray-500' : 'text-orange-500'}`}>
                  {timerPaused ? '⏸️' : '⏱️'} {timeLeft}s
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-800 mb-4">
                {gameState.currentQuestion.question}
              </p>
              {gameState.currentQuestion.hint && (
                <p className="text-purple-600 italic mb-4">💡 Hint: {gameState.currentQuestion.hint}</p>
              )}

              {!gameState.answers.some(a => a.playerId === user._id) ? (
                <div>
                  <input
                    type="text"
                    value={myAnswer}
                    onChange={(e) => setMyAnswer(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                    placeholder="Type your answer..."
                    className="w-full px-4 py-3 rounded-xl border-2 border-purple-300 focus:border-purple-500 focus:outline-none text-lg mb-4"
                  />
                  <button
                    onClick={handleSubmitAnswer}
                    className="w-full bg-gradient-to-r from-green-400 to-blue-500 text-white font-bold text-xl py-3 rounded-xl hover:scale-105 transform transition-all"
                  >
                    SUBMIT! 🚀
                  </button>
                </div>
              ) : (
                <div className="bg-green-100 border-2 border-green-400 rounded-xl p-6 text-center">
                  <div className="text-5xl mb-2">✅</div>
                  <p className="text-xl font-bold text-green-800">Answer submitted!</p>
                  <p className="text-green-600">Waiting for others...</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {gameState.players.filter(p => p.role === 'player').map((p) => {
                const hasAnswered = gameState.answers.some(a => a.playerId === p._id);
                return (
                  <div
                    key={p._id}
                    className={`rounded-xl p-3 text-center ${
                      hasAnswered ? 'bg-green-400' : 'bg-white/50'
                    }`}
                  >
                    {p.avatar ? (
                      <img 
                        src={p.avatar} 
                        alt={p.name} 
                        className="w-8 h-8 rounded-full mx-auto mb-1 border-2 border-white object-cover"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full mx-auto mb-1 border-2 border-white bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-sm font-bold">
                        {p.name[0].toUpperCase()}
                      </div>
                    )}
                    <div className="text-sm font-bold">{p.name}</div>
                    {hasAnswered && <div className="text-lg">✅</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {gameState.phase === 'judging' && (
          <div className="bg-white rounded-3xl p-8 text-center shadow-xl">
            <div className="text-6xl mb-4">👀</div>
            <p className="text-2xl font-bold text-gray-800 mb-2">Judging answers...</p>
            <p className="text-gray-600">Admin is reviewing all answers!</p>
            
            {gameState.answers.find(a => a.playerId === user._id && a.judged) && (
              <div className={`mt-6 p-6 rounded-2xl ${
                gameState.answers.find(a => a.playerId === user._id).isCorrect
                  ? 'bg-green-100 border-2 border-green-400'
                  : 'bg-red-100 border-2 border-red-400'
              }`}>
                <div className="text-6xl mb-2">
                  {gameState.answers.find(a => a.playerId === user._id).isCorrect ? '🎉' : '😢'}
                </div>
                <p className="text-2xl font-bold">
                  {gameState.answers.find(a => a.playerId === user._id).isCorrect
                    ? 'Correct! +1 point!'
                    : 'Not quite right this time!'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
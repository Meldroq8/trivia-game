import { useState, useEffect, useRef } from 'react'

/**
 * RasbrasDisplay - Main screen split display showing both teams' progress
 * in the rasbras (head-to-head quiz) mini-game.
 * Must fit within the QuestionView content area without overflowing.
 */
function RasbrasDisplay({
  session,
  teamAName = 'فريق أ',
  teamBName = 'فريق ب'
}) {
  if (!session) return null

  const [timerExpired, setTimerExpired] = useState(false)

  const questions = session.questions || []
  const totalQuestions = questions.length || 5

  const teamACurrentQ = Math.min(session.teamACurrentQ || 0, totalQuestions)
  const teamBCurrentQ = Math.min(session.teamBCurrentQ || 0, totalQuestions)
  const teamACorrect = session.teamACorrect || 0
  const teamBCorrect = session.teamBCorrect || 0
  const teamAFinished = session.teamAFinished || false
  const teamBFinished = session.teamBFinished || false

  const teamAQuestionText = !teamAFinished && questions[teamACurrentQ]?.question
  const teamBQuestionText = !teamBFinished && questions[teamBCurrentQ]?.question

  // Show results when both finished OR timer expired
  const showResults = (teamAFinished && teamBFinished) || timerExpired

  const TeamPanel = ({ teamName, currentQ, correct, finished, questionText }) => (
    <div className="flex flex-col items-center justify-center gap-3 lg:gap-5 xl:gap-6 px-4 md:px-8 lg:px-12 py-4">
      <h2 className="font-bold text-gray-800 dark:text-white text-center leading-tight text-lg md:text-2xl lg:text-3xl xl:text-4xl">
        {teamName}
      </h2>

      {questionText && !finished && (
        <div className="bg-gray-200/60 dark:bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 md:px-5 md:py-3 lg:px-6 lg:py-4 w-full max-w-[200px] md:max-w-[280px] lg:max-w-[340px]">
          <p className="text-gray-700 dark:text-white text-center font-semibold leading-snug text-sm md:text-base lg:text-lg xl:text-xl">
            {questionText}
          </p>
        </div>
      )}

      <div className="flex gap-2 md:gap-2.5 lg:gap-3">
        {Array.from({ length: totalQuestions }).map((_, i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 md:w-4 md:h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6 rounded-full transition-all ${
              i < currentQ ? 'bg-green-500 shadow-green-500/50 shadow-sm' :
              i === currentQ && !finished ? 'bg-amber-400 animate-pulse' :
              'bg-gray-300 dark:bg-white/20'
            }`}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-gray-800 dark:text-white font-bold text-3xl md:text-5xl lg:text-6xl xl:text-7xl">
          {correct}
        </span>
        <span className="text-green-500 font-bold text-xl md:text-3xl lg:text-4xl">
          ✓
        </span>
      </div>

      {finished && (
        <div className="bg-green-500/20 dark:bg-green-500/30 border border-green-500/40 rounded-lg px-4 py-1.5 lg:px-5 lg:py-2">
          <span className="text-green-700 dark:text-green-200 font-bold text-sm md:text-base lg:text-lg">
            انتهى ✓
          </span>
        </div>
      )}
    </div>
  )

  // Results view (both finished or timer expired)
  if (showResults) {
    const isTied = teamACorrect === teamBCorrect

    // Calculate completion times in seconds
    const getElapsed = (finishedAt) => {
      if (!finishedAt || !session.gameStartedAt) return null
      const start = session.gameStartedAt?.toDate ? session.gameStartedAt.toDate() : new Date(session.gameStartedAt)
      const end = finishedAt?.toDate ? finishedAt.toDate() : new Date(finishedAt)
      return Math.round((end.getTime() - start.getTime()) / 100) / 10 // 1 decimal
    }

    const teamATime = teamAFinished ? getElapsed(session.teamAFinishedAt) : null
    const teamBTime = teamBFinished ? getElapsed(session.teamBFinishedAt) : null

    // Determine winner: more correct wins, if tied the faster one wins
    const getWinner = () => {
      if (teamACorrect > teamBCorrect) return 'A'
      if (teamBCorrect > teamACorrect) return 'B'
      // Tied on score - faster wins
      if (teamATime != null && teamBTime != null) {
        if (teamATime < teamBTime) return 'A'
        if (teamBTime < teamATime) return 'B'
      }
      if (teamATime != null && teamBTime == null) return 'A'
      if (teamBTime != null && teamATime == null) return 'B'
      return null // true tie
    }
    const winner = getWinner()

    const formatTime = (t) => t != null ? `${t} ث` : 'لم ينتهِ'

    return (
      <div className="flex flex-col justify-center items-center w-full h-full overflow-hidden px-2">
        <h2 className="text-gray-800 dark:text-white font-bold mb-2 lg:mb-4 text-center text-base md:text-xl lg:text-3xl shrink-0">
          النتيجة النهائية
        </h2>

        <div className="grid grid-cols-2 gap-3 lg:gap-8 w-full max-w-2xl shrink">
          <div className={`rounded-xl lg:rounded-2xl p-2 md:p-4 lg:p-8 text-center ${
            winner === 'A'
              ? 'bg-green-100 dark:bg-green-600/40 border-2 border-green-500 dark:border-green-400'
              : 'bg-gray-100 dark:bg-white/10'
          }`}>
            <h3 className="text-gray-800 dark:text-white font-bold mb-1 text-sm md:text-base lg:text-2xl">
              {teamAName}
            </h3>
            <div className="text-gray-900 dark:text-white font-bold text-2xl md:text-4xl lg:text-7xl">
              {teamACorrect}
            </div>
            <p className="text-gray-500 dark:text-white/70 text-xs md:text-sm lg:text-lg">
              إجابات صحيحة
            </p>
            <p className="text-gray-400 dark:text-white/50 text-xs md:text-sm lg:text-base mt-1">
              ⏱ {formatTime(teamATime)}
            </p>
          </div>

          <div className={`rounded-xl lg:rounded-2xl p-2 md:p-4 lg:p-8 text-center ${
            winner === 'B'
              ? 'bg-green-100 dark:bg-green-600/40 border-2 border-green-500 dark:border-green-400'
              : 'bg-gray-100 dark:bg-white/10'
          }`}>
            <h3 className="text-gray-800 dark:text-white font-bold mb-1 text-sm md:text-base lg:text-2xl">
              {teamBName}
            </h3>
            <div className="text-gray-900 dark:text-white font-bold text-2xl md:text-4xl lg:text-7xl">
              {teamBCorrect}
            </div>
            <p className="text-gray-500 dark:text-white/70 text-xs md:text-sm lg:text-lg">
              إجابات صحيحة
            </p>
            <p className="text-gray-400 dark:text-white/50 text-xs md:text-sm lg:text-base mt-1">
              ⏱ {formatTime(teamBTime)}
            </p>
          </div>
        </div>

        {isTied && winner && (
          <div className="mt-2 lg:mt-4 bg-green-100 dark:bg-green-500/30 border border-green-400/50 rounded-lg px-4 py-1 lg:px-5 lg:py-2 shrink-0">
            <span className="text-green-700 dark:text-green-200 font-bold text-xs md:text-sm lg:text-xl">
              تعادل! {winner === 'A' ? teamAName : teamBName} أسرع 🏆
            </span>
          </div>
        )}

        {isTied && !winner && (
          <div className="mt-2 lg:mt-4 bg-amber-100 dark:bg-amber-500/30 border border-amber-400/50 rounded-lg px-4 py-1 lg:px-5 lg:py-2 shrink-0">
            <span className="text-amber-700 dark:text-amber-200 font-bold text-xs md:text-sm lg:text-xl">
              تعادل تام!
            </span>
          </div>
        )}
      </div>
    )
  }

  // Active game - split view with centered timer
  return (
    <div className="relative flex items-center justify-center w-full h-full overflow-hidden">
      {/* Centered vertical divider */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-px bg-gray-300 dark:bg-white/20" style={{ height: '60%' }} />

      <div className="flex-1 h-full flex items-center justify-center">
        <TeamPanel
          teamName={teamAName}
          currentQ={teamACurrentQ}
          correct={teamACorrect}
          finished={teamAFinished}
          questionText={teamAQuestionText}
        />
      </div>

      <CountdownTimer session={session} onExpired={() => setTimerExpired(true)} />

      <div className="flex-1 h-full flex items-center justify-center">
        <TeamPanel
          teamName={teamBName}
          currentQ={teamBCurrentQ}
          correct={teamBCorrect}
          finished={teamBFinished}
          questionText={teamBQuestionText}
        />
      </div>
    </div>
  )
}

function CountdownTimer({ session, onExpired }) {
  const [timeRemaining, setTimeRemaining] = useState(session.timerDuration || 30)
  const timerRef = useRef(null)
  const expiredRef = useRef(false)

  useEffect(() => {
    if (!session.gameStartedAt) return

    const startTime = session.gameStartedAt?.toDate
      ? session.gameStartedAt.toDate()
      : new Date(session.gameStartedAt)
    const duration = session.timerDuration || 30

    const tick = () => {
      const elapsed = (Date.now() - startTime.getTime()) / 1000
      const remaining = Math.max(0, duration - elapsed)
      setTimeRemaining(Math.ceil(remaining))
      if (remaining <= 0) {
        clearInterval(timerRef.current)
        if (!expiredRef.current) {
          expiredRef.current = true
          onExpired?.()
        }
      }
    }

    tick()
    timerRef.current = setInterval(tick, 100)
    return () => clearInterval(timerRef.current)
  }, [session.gameStartedAt, session.timerDuration, onExpired])

  const isLow = timeRemaining <= 10

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
      <div
        className={`rounded-full flex items-center justify-center border-2 shadow-lg backdrop-blur-md
          w-11 h-11 md:w-16 md:h-16 lg:w-20 lg:h-20 xl:w-24 xl:h-24 ${
          isLow
            ? 'bg-red-600/90 border-red-400 animate-pulse'
            : 'bg-slate-700/80 border-gray-400 dark:border-white/30'
        }`}
      >
        <span className="font-bold text-white text-base md:text-2xl lg:text-3xl xl:text-4xl">
          {timeRemaining}
        </span>
      </div>
    </div>
  )
}

export default RasbrasDisplay

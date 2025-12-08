import { useMemo } from 'react'

/**
 * HeadbandDisplay Component
 * Shows the counter circles for both teams in headband mini-game
 * Green circles = remaining questions, Red circles = used questions
 */
function HeadbandDisplay({
  teamACounter = 0,
  teamBCounter = 0,
  maxQuestions = 10,
  teamAName = 'فريق أ',
  teamBName = 'فريق ب',
  compact = false
}) {
  // Generate circles for a team
  const renderCircles = useMemo(() => (usedCount) => {
    const circles = []
    for (let i = 0; i < maxQuestions; i++) {
      const isUsed = i < usedCount
      circles.push(
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            compact ? 'w-4 h-4' : 'w-5 h-5 md:w-6 md:h-6'
          } ${
            isUsed
              ? 'bg-red-500 shadow-red-500/50 shadow-md'
              : 'bg-green-500 shadow-green-500/50 shadow-md'
          }`}
        />
      )
    }
    return circles
  }, [maxQuestions, compact])

  return (
    <div className="w-full">
      <div className={`flex justify-between items-start ${compact ? 'gap-4' : 'gap-8'}`}>
        {/* Team A */}
        <div className="flex-1 text-center">
          <h3 className={`font-bold text-gray-800 dark:text-gray-100 mb-2 ${
            compact ? 'text-base' : 'text-lg md:text-xl'
          }`}>
            {teamAName}
          </h3>
          <div className={`flex flex-wrap justify-center ${compact ? 'gap-1' : 'gap-1.5 md:gap-2'}`}>
            {renderCircles(teamACounter)}
          </div>
          <p className={`mt-2 text-gray-600 dark:text-gray-400 font-medium ${
            compact ? 'text-xs' : 'text-sm'
          }`}>
            {teamACounter} / {maxQuestions}
          </p>
        </div>

        {/* Divider */}
        <div className={`w-px bg-gray-300 dark:bg-gray-600 self-stretch ${
          compact ? 'min-h-[60px]' : 'min-h-[80px]'
        }`} />

        {/* Team B */}
        <div className="flex-1 text-center">
          <h3 className={`font-bold text-gray-800 dark:text-gray-100 mb-2 ${
            compact ? 'text-base' : 'text-lg md:text-xl'
          }`}>
            {teamBName}
          </h3>
          <div className={`flex flex-wrap justify-center ${compact ? 'gap-1' : 'gap-1.5 md:gap-2'}`}>
            {renderCircles(teamBCounter)}
          </div>
          <p className={`mt-2 text-gray-600 dark:text-gray-400 font-medium ${
            compact ? 'text-xs' : 'text-sm'
          }`}>
            {teamBCounter} / {maxQuestions}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * HeadbandAnswerDisplay Component
 * Shows both images with answers in the answer reveal state
 * Simple side-by-side layout that fits within the answer area
 */
export function HeadbandAnswerDisplay({
  answer,
  answerImage,
  answer2,
  answerImage2
}) {
  return (
    <div className="w-full h-full flex items-center justify-center gap-3 md:gap-6 p-3 md:p-4 overflow-hidden box-border">
      {/* First Answer Card */}
      <div className="h-full flex flex-col overflow-hidden rounded-lg shadow-md bg-white dark:bg-slate-800" style={{ width: '46%' }}>
        {/* Answer Text */}
        <div className="bg-red-600 text-white py-1 md:py-1.5 px-2 text-center shrink-0">
          <p className="font-bold text-xs md:text-sm truncate">{answer || '---'}</p>
        </div>
        {/* Image Container - takes remaining space */}
        <div className="flex-1 bg-gray-100 dark:bg-slate-700 overflow-hidden">
          {answerImage ? (
            <img
              src={answerImage}
              alt={answer}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-2xl md:text-4xl text-gray-400">🖼️</span>
            </div>
          )}
        </div>
      </div>

      {/* Second Answer Card */}
      <div className="h-full flex flex-col overflow-hidden rounded-lg shadow-md bg-white dark:bg-slate-800" style={{ width: '46%' }}>
        {/* Answer Text */}
        <div className="bg-blue-600 text-white py-1 md:py-1.5 px-2 text-center shrink-0">
          <p className="font-bold text-xs md:text-sm truncate">{answer2 || '---'}</p>
        </div>
        {/* Image Container - takes remaining space */}
        <div className="flex-1 bg-gray-100 dark:bg-slate-700 overflow-hidden">
          {answerImage2 ? (
            <img
              src={answerImage2}
              alt={answer2}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-2xl md:text-4xl text-gray-400">🖼️</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default HeadbandDisplay

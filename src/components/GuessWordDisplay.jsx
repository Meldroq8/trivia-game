import { useMemo } from 'react'

/**
 * GuessWordDisplay Component
 * Shows the counter circles for single player GuessWord mini-game
 * Green circles = remaining questions, Red circles = used questions
 */
function GuessWordDisplay({
  questionCount = 0,
  maxQuestions = 15,
  compact = false
}) {
  // Generate circles
  const circles = useMemo(() => {
    const result = []
    for (let i = 0; i < maxQuestions; i++) {
      const isUsed = i < questionCount
      result.push(
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
    return result
  }, [questionCount, maxQuestions, compact])

  return (
    <div className="w-full">
      <div className="text-center">
        <h3 className={`font-bold text-gray-800 dark:text-gray-100 mb-3 ${
          compact ? 'text-base' : 'text-lg md:text-xl'
        }`}>
          عدد الأسئلة
        </h3>
        <div className={`flex flex-wrap justify-center ${compact ? 'gap-1.5' : 'gap-2 md:gap-2.5'}`}>
          {circles}
        </div>
        <p className={`mt-3 text-gray-600 dark:text-gray-400 font-bold ${
          compact ? 'text-sm' : 'text-base md:text-lg'
        }`}>
          {questionCount} / {maxQuestions}
        </p>
        {questionCount >= maxQuestions && (
          <p className="mt-2 text-red-600 font-bold text-sm">
            انتهت الأسئلة!
          </p>
        )}
      </div>
    </div>
  )
}

export default GuessWordDisplay

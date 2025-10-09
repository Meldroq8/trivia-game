import { devLog, devWarn, prodError } from "../utils/devLog"
import { usePresentationMode } from '../hooks/usePresentationMode'

function PresentationModeToggle({ className = "", style = {} }) {
  const { isPresentationMode, togglePresentationMode } = usePresentationMode()

  return (
    <button
      onClick={togglePresentationMode}
      className={`px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors font-bold ${className}`}
      style={style}
      title={isPresentationMode ? "الخروج من وضع العرض (ESC)" : "وضع العرض التقديمي (F11)"}
    >
      {isPresentationMode ? '📺' : '📽️'}
    </button>
  )
}

export default PresentationModeToggle
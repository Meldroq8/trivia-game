import React from 'react';

/**
 * Unified Footer Component - Grid-Based Layout
 *
 * Uses CSS Grid, CSS Variables, and Order Classes for responsive design
 * No conditional rendering - single unified structure
 *
 * Phone Layout (2 cols):
 * [Team1 Stack+Perks] [Team2 Perks+Stack]
 *
 * Desktop Layout (2 cols, 2 rows):
 * [Team1 Name]        [Team2 Name]        (row 1)
 * [Team1 Score+Perks] [Team2 Score+Perks] (row 2)
 */
const FooterUnified = ({ gameState, setGameState, handlePerkClick, styles, footerRef }) => {
  return (
    <div
      ref={footerRef}
      className="bg-[#f7f2e6] dark:bg-slate-900 border-t-2 border-gray-200 dark:border-slate-700 flex-shrink-0 sticky bottom-0 z-10"
      style={{
        paddingLeft: `${styles.pcScaleFactor > 1 ? 64 : styles.isPhonePortrait ? 8 : 16}px`,
        paddingRight: `${styles.pcScaleFactor > 1 ? 64 : styles.isPhonePortrait ? 8 : 16}px`,
        paddingTop: 0,
        paddingBottom: `${styles.footerPaddingY}px`,
        // CSS Variables for responsive sizing
        '--team-name-width': styles.isPhonePortrait ? '140px' : '200px',
        '--team-name-height': styles.isPhonePortrait ? 'auto' : 'auto',
        '--team-name-font-sm': gameState.team1.name.length > 12 ? '11px' : gameState.team1.name.length > 10 ? '13px' : '15px',
        '--team-name-font-sm-t2': gameState.team2.name.length > 12 ? '11px' : gameState.team2.name.length > 10 ? '13px' : '15px',
        '--team-name-font-lg': gameState.team1.name.length > 14 ? '16px' : gameState.team1.name.length > 12 ? '18px' : '20px',
        '--team-name-font-lg-t2': gameState.team2.name.length > 14 ? '16px' : gameState.team2.name.length > 12 ? '18px' : '20px',
        '--team-name-padding': styles.isPhonePortrait ? '4px 12px' : '8px 16px',
        '--score-width': styles.isPhonePortrait ? '140px' : '200px',
        '--score-height': styles.isPhonePortrait ? 'auto' : 'auto',
        '--score-font': styles.isPhonePortrait ? `${styles.headerFontSize * 0.7}px` : '18px',
        '--score-padding-x': styles.isPhonePortrait ? '24px' : '32px',
        '--score-padding-y': styles.isPhonePortrait ? '4px' : '8px',
        '--perk-size': styles.isPhonePortrait ? '36px' : `${styles.footerButtonSize * 0.5}px`,
        '--perk-gap': styles.isPhonePortrait ? '4px' : (styles.pcScaleFactor > 1 ? '16px' : '8px'),
        '--button-size': styles.isPhonePortrait ? '20px' : '24px',
        '--button-svg': styles.isPhonePortrait ? '12px' : '16px',
        '--border-width': styles.isPhonePortrait ? '2px' : '2px',
        '--element-gap': styles.isPhonePortrait ? '4px' : (styles.pcScaleFactor > 1 ? '16px' : '8px'),
        '--team-gap': styles.isPhonePortrait ? '8px' : '12px'
      }}
    >
      <div className="grid grid-cols-2 lg:grid-rows-2 lg:auto-rows-auto w-full pt-2 lg:pt-4 px-1 lg:px-2" style={{ gap: 'var(--team-gap)' }}>
        {/* Team 1 Name - Hidden on phone, shown on desktop */}
        <div className="hidden lg:block lg:order-1 lg:col-span-1 lg:row-start-1">
          <div className="bg-red-500 text-white rounded-full font-bold text-center" style={{
            fontSize: 'var(--team-name-font-lg)',
            width: 'var(--team-name-width)',
            padding: 'var(--team-name-padding)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {gameState.team1.name}
          </div>
        </div>

        {/* Team 2 Name - Hidden on phone, shown on desktop */}
        <div className="hidden lg:block lg:order-2 lg:col-span-1 lg:row-start-1">
          <div className="bg-red-500 text-white rounded-full font-bold text-center" style={{
            fontSize: 'var(--team-name-font-lg-t2)',
            width: 'var(--team-name-width)',
            padding: 'var(--team-name-padding)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {gameState.team2.name}
          </div>
        </div>

        {/* Team 1 Group (Name+Score+Perks) */}
        <div className="order-1 lg:order-3 lg:col-span-1 lg:row-start-2 flex items-center justify-between lg:justify-start" style={{ gap: 'var(--perk-gap)' }}>
          {/* Team 1 Name+Score Stack (shown on phone only) */}
          <div className="flex flex-col items-center lg:contents" style={{ gap: '1px' }}>
            {/* Name - phone only */}
            <div className="lg:hidden bg-red-500 text-white rounded-full font-bold text-center" style={{
              fontSize: 'var(--team-name-font-sm)',
              width: 'var(--team-name-width)',
              padding: 'var(--team-name-padding)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {gameState.team1.name}
            </div>

            {/* Score Container */}
            <div className="bg-white dark:bg-slate-800 rounded-full flex items-center justify-between font-bold relative" style={{
              fontSize: 'var(--score-font)',
              color: '#B91C1C',
              width: 'var(--score-width)',
              height: 'var(--score-height)',
              paddingLeft: 'var(--score-padding-x)',
              paddingRight: 'var(--score-padding-x)',
              paddingTop: 'var(--score-padding-y)',
              paddingBottom: 'var(--score-padding-y)',
              border: 'var(--border-width) solid #d1d5db'
            }}>
              <button
                onClick={() => setGameState(prev => ({
                  ...prev,
                  team1: { ...prev.team1, score: Math.max(0, prev.team1.score - 100) }
                }))}
                className="absolute bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors flex items-center justify-center lg:left-1 left-0.5"
                style={{
                  width: 'var(--button-size)',
                  height: 'var(--button-size)',
                  padding: '0'
                }}
              >
                <svg style={{ width: 'var(--button-svg)', height: 'var(--button-svg)' }} viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="2" rx="1" fill="white"/>
                </svg>
              </button>
              <span className="flex-1 text-center dark:text-red-400">{gameState.team1.score}</span>
              <button
                onClick={() => setGameState(prev => ({
                  ...prev,
                  team1: { ...prev.team1, score: prev.team1.score + 100 }
                }))}
                className="absolute bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors flex items-center justify-center lg:right-1 right-0.5"
                style={{
                  width: 'var(--button-size)',
                  height: 'var(--button-size)',
                  padding: '0'
                }}
              >
                <svg style={{ width: 'var(--button-svg)', height: 'var(--button-svg)' }} viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="2" rx="1" fill="white"/>
                  <rect x="7" y="3" width="2" height="10" rx="1" fill="white"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Team 1 Perks */}
          <div className="flex items-center" style={{ gap: 'var(--perk-gap)' }}>
            <div
              className={`rounded-full flex items-center justify-center transition-colors ${
                (gameState.perkUsage?.team1?.double || 0) >= 1
                  ? 'border-gray-600 dark:border-slate-500 bg-gray-200 dark:bg-slate-700 opacity-50 cursor-not-allowed'
                  : gameState.currentTurn !== 'team1'
                  ? 'border-gray-600 dark:border-slate-500 bg-gray-100 dark:bg-slate-700 opacity-60 cursor-not-allowed'
                  : 'border-red-600 dark:border-red-500 bg-white dark:bg-slate-800 cursor-pointer hover:bg-red-50 dark:hover:bg-slate-700'
              }`}
              style={{
                width: 'var(--perk-size)',
                height: 'var(--perk-size)',
                minWidth: 'var(--perk-size)',
                minHeight: 'var(--perk-size)',
                maxWidth: 'var(--perk-size)',
                maxHeight: 'var(--perk-size)',
                border: 'var(--border-width) solid currentColor'
              }}
              onClick={() => handlePerkClick('double', 'team1')}
            >
              <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill={(gameState.perkUsage?.team1?.double || 0) >= 1 || gameState.currentTurn !== 'team1' ? '#6b7280' : '#dc2626'} stroke="none"/>
                <text x="12" y="15" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">2</text>
              </svg>
            </div>
            <div
              className="border-gray-600 dark:border-slate-500 bg-gray-200 dark:bg-slate-700 opacity-50 cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
              style={{
                width: 'var(--perk-size)',
                height: 'var(--perk-size)',
                minWidth: 'var(--perk-size)',
                minHeight: 'var(--perk-size)',
                maxWidth: 'var(--perk-size)',
                maxHeight: 'var(--perk-size)',
                border: 'var(--border-width) solid currentColor'
              }}
              title="متاح فقط أثناء السؤال"
            >
              <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="#6b7280" stroke="none"/>
              </svg>
            </div>
            <div
              className="border-gray-600 dark:border-slate-500 bg-gray-200 dark:bg-slate-700 opacity-50 cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
              style={{
                width: 'var(--perk-size)',
                height: 'var(--perk-size)',
                minWidth: 'var(--perk-size)',
                minHeight: 'var(--perk-size)',
                maxWidth: 'var(--perk-size)',
                maxHeight: 'var(--perk-size)',
                border: 'var(--border-width) solid currentColor'
              }}
              title="متاح فقط أثناء السؤال"
            >
              <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="#6b7280" stroke="none"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Team 2 Group (Perks+Name+Score) - Note: order reversed on phone */}
        <div className="order-2 lg:order-4 lg:col-span-1 lg:row-start-2 flex items-center justify-between lg:justify-start flex-row-reverse lg:flex-row" style={{ gap: 'var(--perk-gap)' }}>
          {/* Team 2 Name+Score Stack (shown on phone only) */}
          <div className="flex flex-col items-center lg:contents" style={{ gap: '1px' }}>
            {/* Name - phone only */}
            <div className="lg:hidden bg-red-500 text-white rounded-full font-bold text-center" style={{
              fontSize: 'var(--team-name-font-sm-t2)',
              width: 'var(--team-name-width)',
              padding: 'var(--team-name-padding)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {gameState.team2.name}
            </div>

            {/* Score Container */}
            <div className="bg-white dark:bg-slate-800 rounded-full flex items-center justify-between font-bold relative" style={{
              fontSize: 'var(--score-font)',
              color: '#B91C1C',
              width: 'var(--score-width)',
              height: 'var(--score-height)',
              paddingLeft: 'var(--score-padding-x)',
              paddingRight: 'var(--score-padding-x)',
              paddingTop: 'var(--score-padding-y)',
              paddingBottom: 'var(--score-padding-y)',
              border: 'var(--border-width) solid #d1d5db'
            }}>
              <button
                onClick={() => setGameState(prev => ({
                  ...prev,
                  team2: { ...prev.team2, score: Math.max(0, prev.team2.score - 100) }
                }))}
                className="absolute bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors flex items-center justify-center lg:left-1 left-0.5"
                style={{
                  width: 'var(--button-size)',
                  height: 'var(--button-size)',
                  padding: '0'
                }}
              >
                <svg style={{ width: 'var(--button-svg)', height: 'var(--button-svg)' }} viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="2" rx="1" fill="white"/>
                </svg>
              </button>
              <span className="flex-1 text-center dark:text-red-400">{gameState.team2.score}</span>
              <button
                onClick={() => setGameState(prev => ({
                  ...prev,
                  team2: { ...prev.team2, score: prev.team2.score + 100 }
                }))}
                className="absolute bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors flex items-center justify-center lg:right-1 right-0.5"
                style={{
                  width: 'var(--button-size)',
                  height: 'var(--button-size)',
                  padding: '0'
                }}
              >
                <svg style={{ width: 'var(--button-svg)', height: 'var(--button-svg)' }} viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="2" rx="1" fill="white"/>
                  <rect x="7" y="3" width="2" height="10" rx="1" fill="white"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Team 2 Perks */}
          <div className="flex items-center" style={{ gap: 'var(--perk-gap)' }}>
            <div
              className={`rounded-full flex items-center justify-center transition-colors ${
                (gameState.perkUsage?.team2?.double || 0) >= 1
                  ? 'border-gray-600 dark:border-slate-500 bg-gray-200 dark:bg-slate-700 opacity-50 cursor-not-allowed'
                  : gameState.currentTurn !== 'team2'
                  ? 'border-gray-600 dark:border-slate-500 bg-gray-100 dark:bg-slate-700 opacity-60 cursor-not-allowed'
                  : 'border-red-600 dark:border-red-500 bg-white dark:bg-slate-800 cursor-pointer hover:bg-red-50 dark:hover:bg-slate-700'
              }`}
              style={{
                width: 'var(--perk-size)',
                height: 'var(--perk-size)',
                minWidth: 'var(--perk-size)',
                minHeight: 'var(--perk-size)',
                maxWidth: 'var(--perk-size)',
                maxHeight: 'var(--perk-size)',
                border: 'var(--border-width) solid currentColor'
              }}
              onClick={() => handlePerkClick('double', 'team2')}
            >
              <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill={(gameState.perkUsage?.team2?.double || 0) >= 1 || gameState.currentTurn !== 'team2' ? '#6b7280' : '#dc2626'} stroke="none"/>
                <text x="12" y="15" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">2</text>
              </svg>
            </div>
            <div
              className="border-gray-600 dark:border-slate-500 bg-gray-200 dark:bg-slate-700 opacity-50 cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
              style={{
                width: 'var(--perk-size)',
                height: 'var(--perk-size)',
                minWidth: 'var(--perk-size)',
                minHeight: 'var(--perk-size)',
                maxWidth: 'var(--perk-size)',
                maxHeight: 'var(--perk-size)',
                border: 'var(--border-width) solid currentColor'
              }}
              title="متاح فقط أثناء السؤال"
            >
              <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="#6b7280" stroke="none"/>
              </svg>
            </div>
            <div
              className="border-gray-600 dark:border-slate-500 bg-gray-200 dark:bg-slate-700 opacity-50 cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
              style={{
                width: 'var(--perk-size)',
                height: 'var(--perk-size)',
                minWidth: 'var(--perk-size)',
                minHeight: 'var(--perk-size)',
                maxWidth: 'var(--perk-size)',
                maxHeight: 'var(--perk-size)',
                border: 'var(--border-width) solid currentColor'
              }}
              title="متاح فقط أثناء السؤال"
            >
              <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="#6b7280" stroke="none"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FooterUnified;

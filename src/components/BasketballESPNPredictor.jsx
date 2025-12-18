import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ScatterChart, Scatter } from 'recharts';
import { TrendingUp, Upload, Link as LinkIcon, Zap, AlertCircle, Download } from 'lucide-react';

const BasketballESPNPredictor = () => {
  const [gameData, setGameData] = useState([]);
  const [url, setUrl] = useState('https://www.espn.com/nba/playbyplay/_/gameId/401810222');
  const [manualInput, setManualInput] = useState('');
  const [q1Input, setQ1Input] = useState('');
  const [q2Input, setQ2Input] = useState('');
  const [q3Input, setQ3Input] = useState('');
  const [q4Input, setQ4Input] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [homeTeam, setHomeTeam] = useState('Cleveland Cavaliers');
  const [awayTeam, setAwayTeam] = useState('Chicago Bulls');
  const [velocityWindow, setVelocityWindow] = useState(120);
  const [selectedTime, setSelectedTime] = useState(null);
  const [overUnderLine, setOverUnderLine] = useState('');
  const [overUnderConfidence, setOverUnderConfidence] = useState('');
  const [overUnderHigh, setOverUnderHigh] = useState('');
  const [overUnderHighConfidence, setOverUnderHighConfidence] = useState('');
  const [bettingScore, setBettingScore] = useState('');
  const [bettingCost, setBettingCost] = useState('');
  const [homeTeamHistory, setHomeTeamHistory] = useState('');
  const [awayTeamHistory, setAwayTeamHistory] = useState('');
  
  const TOTAL_GAME_TIME = 48 * 60;

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const calculateVelocity = (data, currentIndex) => {
    if (currentIndex < 1) return { totalVelocity: 0, homeVelocity: 0, awayVelocity: 0 };

    const currentPoint = data[currentIndex];
    const currentTime = currentPoint.timeSeconds;
    const currentTotal = currentPoint.home + currentPoint.away;
    
    // Calculate overall rate from start of game as a sanity check
    const overallRate = currentTime > 0 ? currentTotal / currentTime : 0;
    
    // Use a minimum window size to avoid short-term bursts skewing predictions
    const minWindow = Math.max(velocityWindow, 180); // At least 3 minutes
    const windowStart = currentTime - minWindow;
    
    // Filter points in the time window
    const recentPoints = data.filter((p, idx) => 
      idx <= currentIndex && p.timeSeconds >= windowStart
    );

    if (recentPoints.length < 2) {
      // Fallback to overall rate if not enough data
      return { 
        totalVelocity: overallRate, 
        homeVelocity: currentPoint.home / currentTime, 
        awayVelocity: currentPoint.away / currentTime 
      };
    }

    // Find the oldest point in the window
    const oldest = recentPoints[0];
    
    // Find the most recent point where score actually changed
    let newest = recentPoints[recentPoints.length - 1];
    
    // If newest has same score as oldest, look backwards for a score change
    if (newest.home === oldest.home && newest.away === oldest.away && recentPoints.length > 2) {
      for (let i = recentPoints.length - 2; i >= 0; i--) {
        const point = recentPoints[i];
        if (point.home !== oldest.home || point.away !== oldest.away) {
          newest = point;
          break;
        }
      }
    }
    
    const timeDiff = newest.timeSeconds - oldest.timeSeconds;

    if (timeDiff === 0 || timeDiff < 60) {
      // If window is too small, use overall rate
      return { 
        totalVelocity: overallRate, 
        homeVelocity: currentPoint.home / currentTime, 
        awayVelocity: currentPoint.away / currentTime 
      };
    }

    // Calculate scoring frequency: count how many 15-second periods had score changes
    const SCORING_PERIOD = 15; // 15 seconds
    const totalPeriods = Math.floor(timeDiff / SCORING_PERIOD);
    let scoringPeriods = 0;
    let totalEvents = 0;
    let missedShots = 0;
    let madeShots = 0;
    
    // Group points into 15-second periods and count periods with score changes
    for (let period = 0; period < totalPeriods; period++) {
      const periodStart = oldest.timeSeconds + (period * SCORING_PERIOD);
      const periodEnd = periodStart + SCORING_PERIOD;
      
      // Find points in this period
      const periodPoints = recentPoints.filter(p => 
        p.timeSeconds >= periodStart && p.timeSeconds < periodEnd
      );
      
      totalEvents += periodPoints.length;
      
      // Track missed vs made shots and other non-scoring events
      periodPoints.forEach(point => {
        if (point.play) {
          const playLower = point.play.toLowerCase();
          
          // Detect misses (more comprehensive patterns)
          if (playLower.includes('misses') || 
              playLower.includes('miss ') || 
              playLower.includes(' missed') ||
              (playLower.includes('miss') && !playLower.includes('makes'))) {
            missedShots++;
          } 
          // Detect made shots
          else if (playLower.includes('makes') || 
                   playLower.includes('make ') ||
                   (playLower.includes('makes free throw') && !playLower.includes('misses'))) {
            madeShots++;
          }
          // Also count turnovers as negative events (they slow down scoring)
          else if (playLower.includes('turnover') || playLower.includes('turn over')) {
            missedShots += 0.5; // Turnovers are bad but not as bad as misses
          }
        }
      });
      
      // Check if score changed in this period (any scoring event occurred)
      if (periodPoints.length > 0) {
        // Check if any consecutive points have different scores (indicating scoring)
        for (let i = 1; i < periodPoints.length; i++) {
          const prevTotal = periodPoints[i - 1].home + periodPoints[i - 1].away;
          const currTotal = periodPoints[i].home + periodPoints[i].away;
          if (prevTotal !== currTotal) {
            scoringPeriods++;
            break; // Count this period once even if multiple scores
          }
        }
      }
    }
    
    // Calculate scoring frequency factor (0 to 1)
    const scoringFrequency = totalPeriods > 0 ? scoringPeriods / totalPeriods : 0.5;
    const eventDensity = totalEvents > 0 ? scoringPeriods / totalEvents : 0.1;
    
    // Calculate shooting efficiency factor based on misses vs makes
    const totalShotAttempts = missedShots + madeShots;
    let shootingEfficiency = 0.5; // Default neutral
    if (totalShotAttempts > 0) {
      const makeRate = madeShots / totalShotAttempts;
      // More aggressive weighting: misses have stronger impact
      shootingEfficiency = 0.2 + ((makeRate - 0.35) * 2.67); // Maps 0.35->0.2, 0.5->0.6, 0.65->1.0
      shootingEfficiency = Math.max(0.15, Math.min(1.0, shootingEfficiency)); // Clamp between 0.15 and 1.0
    } else if (missedShots > 0 && madeShots === 0) {
      // If we only have misses and no makes, heavily penalize
      shootingEfficiency = 0.15;
    }
    
    // Combine all factors: scoring frequency, event density, and shooting efficiency
    const combinedFrequency = (scoringFrequency * 0.4) + (eventDensity * 0.15) + (shootingEfficiency * 0.45);
    
    // Calculate base velocity
    let totalVelocity = ((newest.home + newest.away) - (oldest.home + oldest.away)) / timeDiff;
    let homeVelocity = (newest.home - oldest.home) / timeDiff;
    let awayVelocity = (newest.away - oldest.away) / timeDiff;
    
    // Apply scoring frequency adjustment: reduce velocity when there are periods without scoring
    const paceFactor = 0.5 + (combinedFrequency * 0.5); // Maps 0->0.5, 1->1.0
    
    totalVelocity *= paceFactor;
    homeVelocity *= paceFactor;
    awayVelocity *= paceFactor;
    
    // Cap velocity to reasonable bounds (between 0.5x and 2x overall rate)
    const maxVelocity = overallRate * 2;
    const minVelocity = overallRate * 0.5;
    
    totalVelocity = Math.max(minVelocity, Math.min(maxVelocity, totalVelocity));
    homeVelocity = Math.max(0, Math.min(maxVelocity, homeVelocity));
    awayVelocity = Math.max(0, Math.min(maxVelocity, awayVelocity));

    return { totalVelocity, homeVelocity, awayVelocity };
  };

  const calculatePredictionAtPoint = (point, velocity, historicalAvg = null, gameProgress = null) => {
    const timeRemaining = TOTAL_GAME_TIME - point.timeSeconds;
    const currentTotal = point.home + point.away;
    const gameProgress = point.timeSeconds / TOTAL_GAME_TIME;
    
    // Calculate overall rate from start
    const overallRate = point.timeSeconds > 0 ? currentTotal / point.timeSeconds : 0;
    
    // Use weighted average: 70% recent velocity, 30% overall rate
    const weightedVelocity = velocity.totalVelocity * 0.7 + overallRate * 0.3;
    const weightedHomeVelocity = velocity.homeVelocity * 0.7 + (point.home / point.timeSeconds) * 0.3;
    const weightedAwayVelocity = velocity.awayVelocity * 0.7 + (point.away / point.timeSeconds) * 0.3;
    
    // Calculate predictions using weighted velocity
    let predictedTotal = Math.round(currentTotal + (weightedVelocity * timeRemaining));
    let predictedHome = Math.round(point.home + (weightedHomeVelocity * timeRemaining));
    let predictedAway = Math.round(point.away + (weightedAwayVelocity * timeRemaining));
    
    // Incorporate historical data if available (blend with velocity-based prediction)
    if (historicalAvg && gameProgress && gameProgress > 0.1) { // Only use historical data after 10% of game
      const currentProjection = currentTotal / gameProgress;
      
      // Calculate how much to weight historical data based on:
      // 1. How much of the game has elapsed (more weight early in game)
      // 2. How close current pace is to historical average
      const paceDifference = Math.abs(currentProjection - historicalAvg) / historicalAvg;
      const historicalWeight = Math.min(0.25, Math.max(0.05, (1 - gameProgress) * 0.3)); // 5-25% weight, more early
      
      // If current pace is very different from historical, reduce historical weight
      const adjustedWeight = paceDifference > 0.2 ? historicalWeight * 0.5 : historicalWeight;
      
      // Blend velocity-based prediction with historical average
      predictedTotal = Math.round(predictedTotal * (1 - adjustedWeight) + historicalAvg * adjustedWeight);
    }
    
    // Ensure predictions don't go below current scores
    predictedTotal = Math.max(predictedTotal, currentTotal);
    predictedHome = Math.max(predictedHome, point.home);
    predictedAway = Math.max(predictedAway, point.away);
    
    // If velocity is zero or invalid, use proportional extrapolation
    if (velocity.totalVelocity === 0 && timeRemaining > 0 && gameProgress > 0) {
      predictedTotal = Math.round(currentTotal / gameProgress);
      predictedHome = Math.round(point.home / gameProgress);
      predictedAway = Math.round(point.away / gameProgress);
    }
    
    // Sanity check: typical NBA games are 180-250 total points
    const minPredictedTotal = Math.max(currentTotal, 150);
    const maxPredictedTotal = 350;
    predictedTotal = Math.max(minPredictedTotal, Math.min(maxPredictedTotal, predictedTotal));

    return { predictedTotal, predictedHome, predictedAway };
  };

  const processGameData = (rawData) => {
    return rawData.map((point, index) => {
      const velocity = calculateVelocity(rawData, index);
      const gameProgress = point.timeSeconds / TOTAL_GAME_TIME;
      const historicalAvg = historicalTotal ? historicalTotal.avg : null;
      const prediction = calculatePredictionAtPoint(point, velocity, historicalAvg, gameProgress);
      const currentTotal = point.home + point.away;
      
      return {
        ...point,
        total: currentTotal,
        velocity: velocity.totalVelocity * 60,
        predictedTotal: prediction.predictedTotal,
        predictedHome: prediction.predictedHome,
        predictedAway: prediction.predictedAway,
        actualFinal: rawData[rawData.length - 1].home + rawData[rawData.length - 1].away,
        error: Math.abs(prediction.predictedTotal - (rawData[rawData.length - 1].home + rawData[rawData.length - 1].away))
      };
    });
  };

  const parseTime = (timeStr, currentQuarter = 1) => {
    if (!timeStr || timeStr.toLowerCase().includes('end')) {
      return null; // End of quarter row
    }
    
    // Handle seconds format like "58.5" (seconds remaining in quarter)
    if (timeStr.includes('.') && !timeStr.includes(':')) {
      const secondsRemaining = parseFloat(timeStr);
      const quarterTime = 12 * 60; // 12 minutes = 720 seconds
      const elapsedInQuarter = quarterTime - secondsRemaining;
      // Add previous quarters (each quarter is 720 seconds)
      return (currentQuarter - 1) * 720 + elapsedInQuarter;
    }
    
    // Handle MM:SS format
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]);
      const seconds = parseInt(parts[1]);
      const totalSeconds = minutes * 60 + seconds;
      
      // ESPN format: time is "time remaining" in quarter
      // Convert to elapsed time: 12:00 - time_remaining = elapsed
      const quarterTime = 12 * 60; // 12 minutes = 720 seconds
      const elapsedInQuarter = quarterTime - totalSeconds;
      // Add previous quarters (each quarter is 720 seconds)
      return (currentQuarter - 1) * 720 + elapsedInQuarter;
    }
    
    return null;
  };

  const parseQuarterData = (inputText, quarterNumber) => {
    const lines = inputText.trim().split('\n');
    const parsed = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;
      
      // Skip header rows
      if (line.toUpperCase().includes('TIME') && line.toUpperCase().includes('PLAY')) {
        continue;
      }
      
      // Skip end of quarter markers
      if (line.toLowerCase().includes('end of') || line.toLowerCase().includes('quarter')) {
        continue;
      }
      
      // Try tab-separated first
      let parts = line.split('\t');
      if (parts.length < 3) {
        parts = line.split(',');
      }
      parts = parts.map(p => p.trim()).filter(p => p !== '');
      
      if (parts.length >= 4) {
        const timeStr = parts[0];
        const time = parseTime(timeStr, quarterNumber);
        
        if (time === null) continue;
        
        const home = parseInt(parts[parts.length - 2]);
        const away = parseInt(parts[parts.length - 1]);
        
        if (!isNaN(home) && !isNaN(away)) {
          const playDescription = parts.length >= 4 ? parts[1] : '';
          parsed.push({
            timeSeconds: time,
            time: formatTime(time),
            home,
            away,
            quarter: `Q${quarterNumber}`,
            play: playDescription
          });
        }
      } else if (parts.length >= 3) {
        const timeStr = parts[0];
        const time = parseTime(timeStr, quarterNumber);
        
        if (time === null) continue;
        
        const numbers = [];
        for (let j = 1; j < parts.length; j++) {
          const num = parseInt(parts[j]);
          if (!isNaN(num)) {
            numbers.push(num);
          }
        }
        
        if (numbers.length >= 2) {
          const home = numbers[numbers.length - 2];
          const away = numbers[numbers.length - 1];
          const playDescription = parts.length >= 3 ? parts.slice(1, -2).join(' ') : '';
          
          parsed.push({
            timeSeconds: time,
            time: formatTime(time),
            home,
            away,
            quarter: `Q${quarterNumber}`,
            play: playDescription
          });
        }
      }
    }
    
    return parsed;
  };

  const handleQuarterInput = () => {
    try {
      setError('');
      const allParsed = [];
      
      // Parse each quarter
      if (q1Input.trim()) {
        const q1Data = parseQuarterData(q1Input, 1);
        allParsed.push(...q1Data);
      }
      
      if (q2Input.trim()) {
        const q2Data = parseQuarterData(q2Input, 2);
        allParsed.push(...q2Data);
      }
      
      if (q3Input.trim()) {
        const q3Data = parseQuarterData(q3Input, 3);
        allParsed.push(...q3Data);
      }
      
      if (q4Input.trim()) {
        const q4Data = parseQuarterData(q4Input, 4);
        allParsed.push(...q4Data);
      }
      
      if (allParsed.length === 0) {
        setError('Please enter data for at least one quarter');
        return;
      }
      
      // Sort by time and remove duplicates
      const scoreMap = new Map();
      allParsed.forEach(point => {
        const key = point.timeSeconds;
        if (!scoreMap.has(key) || scoreMap.get(key).timeSeconds < point.timeSeconds) {
          scoreMap.set(key, point);
        }
      });
      
      const uniqueParsed = Array.from(scoreMap.values()).sort((a, b) => a.timeSeconds - b.timeSeconds);
      
      const processed = processGameData(uniqueParsed);
      setGameData(processed);
      setSelectedTime(processed.length - 1);
    } catch (err) {
      setError('Error parsing quarter data: ' + err.message);
    }
  };

  const handleManualInput = () => {
    try {
      setError('');
      const lines = manualInput.trim().split('\n');
      const parsed = [];
      let currentQuarter = 1;
      let lastTime = null;
      
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        // Skip header rows (like "TIME	PLAY	CLE	CHI")
        if (line.toUpperCase().includes('TIME') && line.toUpperCase().includes('PLAY')) {
          continue;
        }
        
        // Check for quarter markers in play descriptions or end markers
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('end of') || lowerLine.includes('quarter') || 
            lowerLine.includes('1st quarter') || lowerLine.includes('2nd quarter') ||
            lowerLine.includes('3rd quarter') || lowerLine.includes('4th quarter')) {
          // Extract quarter number if possible
          const quarterMatch = line.match(/([1-4])(st|nd|rd|th)?/i);
          if (quarterMatch) {
            currentQuarter = parseInt(quarterMatch[1]);
          }
          continue;
        }
        
        // Try tab-separated first (ESPN format: time\tdescription\thome\taway)
        let parts = line.split('\t');
        
        // If no tabs, try comma-separated
        if (parts.length < 3) {
          parts = line.split(',');
        }
        
        // Filter out empty parts
        parts = parts.map(p => p.trim()).filter(p => p !== '');
        
        // Detect quarter change: if time jumps back to ~12:00 after being lower
        if (parts.length >= 1) {
          const timeStr = parts[0];
          // Check if time resets (indicates new quarter)
          if (timeStr.includes(':') && !timeStr.includes('.')) {
            const timeParts = timeStr.split(':');
            if (timeParts.length === 2) {
              const mins = parseInt(timeParts[0]);
              const secs = parseInt(timeParts[1]);
              if (!isNaN(mins) && !isNaN(secs)) {
                const currentTime = mins * 60 + secs;
                // If we see 12:00 or 11:xx after seeing lower times, it's likely a new quarter
                if (mins >= 11 && lastTime !== null && lastTime < 600) {
                  currentQuarter++;
                }
                lastTime = currentTime;
              }
            }
          }
        }
        
        if (parts.length >= 4) {
          // ESPN format: TIME, PLAY, HOME_SCORE, AWAY_SCORE
          const timeStr = parts[0];
          const time = parseTime(timeStr, currentQuarter);
          
          if (time === null) continue; // Skip invalid time rows
          
          // Last two columns should be scores
          const home = parseInt(parts[parts.length - 2]);
          const away = parseInt(parts[parts.length - 1]);
          
          if (!isNaN(home) && !isNaN(away)) {
            // Store play description (usually parts[1]) for tracking misses
            const playDescription = parts.length >= 4 ? parts[1] : '';
            parsed.push({
              timeSeconds: time,
              time: formatTime(time),
              home,
              away,
              quarter: `Q${currentQuarter}`,
              play: playDescription
            });
          }
        } else if (parts.length >= 3) {
          // Fallback: try to find scores in any position
          const timeStr = parts[0];
          const time = parseTime(timeStr, currentQuarter);
          
          if (time === null) continue;
          
          // Find the last two numeric values (home and away scores)
          const numbers = [];
          for (let j = 1; j < parts.length; j++) {
            const num = parseInt(parts[j]);
            if (!isNaN(num)) {
              numbers.push(num);
            }
          }
          
          if (numbers.length >= 2) {
            const home = numbers[numbers.length - 2];
            const away = numbers[numbers.length - 1];
            
            // Try to extract play description if available
            const playDescription = parts.length >= 3 ? parts.slice(1, -2).join(' ') : '';
            
            parsed.push({
              timeSeconds: time,
              time: formatTime(time),
              home,
              away,
              quarter: `Q${currentQuarter}`,
              play: playDescription
            });
          }
        }
      }

      if (parsed.length === 0) {
        setError('No valid data found. Paste ESPN play-by-play data with TIME, PLAY, HOME_SCORE, AWAY_SCORE columns');
        return;
      }

      // Sort by time and remove duplicates (keep last score for same time)
      const scoreMap = new Map();
      parsed.forEach(point => {
        const key = point.timeSeconds;
        if (!scoreMap.has(key) || scoreMap.get(key).timeSeconds < point.timeSeconds) {
          scoreMap.set(key, point);
        }
      });
      
      const uniqueParsed = Array.from(scoreMap.values()).sort((a, b) => a.timeSeconds - b.timeSeconds);
      
      const processed = processGameData(uniqueParsed);
      setGameData(processed);
      setSelectedTime(processed.length - 1);
    } catch (err) {
      setError('Error parsing input: ' + err.message);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        setError('');
        const text = e.target.result;
        const lines = text.trim().split('\n');
        const parsed = [];

        const startIndex = lines[0].toLowerCase().includes('time') ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
          const parts = lines[i].trim().split(/[,\s\t]+/);
          if (parts.length >= 3) {
            const time = parseTime(parts[0]);
            const home = parseInt(parts[1]);
            const away = parseInt(parts[2]);
            
            if (!isNaN(time) && !isNaN(home) && !isNaN(away)) {
              parsed.push({
                timeSeconds: time,
                time: formatTime(time),
                home,
                away,
                quarter: `Q${Math.min(Math.floor(time / 720) + 1, 4)}`
              });
            }
          }
        }

        if (parsed.length === 0) {
          setError('No valid data in file');
          return;
        }

        parsed.sort((a, b) => a.timeSeconds - b.timeSeconds);
        const processed = processGameData(parsed);
        setGameData(processed);
        setSelectedTime(processed.length - 1);
      } catch (err) {
        setError('Error reading file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const loadSampleData = () => {
    // Bulls vs Cavaliers Q1 data from ESPN
    const sample = [
      { timeSeconds: 0, time: '0:00', home: 0, away: 0, quarter: 'Q1' },
      { timeSeconds: 43, time: '0:43', home: 2, away: 0, quarter: 'Q1' },
      { timeSeconds: 59, time: '0:59', home: 2, away: 2, quarter: 'Q1' },
      { timeSeconds: 72, time: '1:12', home: 4, away: 2, quarter: 'Q1' },
      { timeSeconds: 109, time: '1:49', home: 4, away: 4, quarter: 'Q1' },
      { timeSeconds: 121, time: '2:01', home: 6, away: 4, quarter: 'Q1' },
      { timeSeconds: 136, time: '2:16', home: 9, away: 4, quarter: 'Q1' },
      { timeSeconds: 151, time: '2:31', home: 9, away: 6, quarter: 'Q1' },
      { timeSeconds: 165, time: '2:45', home: 12, away: 6, quarter: 'Q1' },
      { timeSeconds: 183, time: '3:03', home: 12, away: 8, quarter: 'Q1' },
      { timeSeconds: 188, time: '3:08', home: 15, away: 8, quarter: 'Q1' },
      { timeSeconds: 202, time: '3:22', home: 15, away: 11, quarter: 'Q1' },
      { timeSeconds: 219, time: '3:39', home: 17, away: 11, quarter: 'Q1' },
      { timeSeconds: 246, time: '4:06', home: 20, away: 11, quarter: 'Q1' },
      { timeSeconds: 255, time: '4:15', home: 20, away: 13, quarter: 'Q1' },
      { timeSeconds: 270, time: '4:30', home: 20, away: 16, quarter: 'Q1' },
      { timeSeconds: 294, time: '4:54', home: 23, away: 16, quarter: 'Q1' },
      { timeSeconds: 360, time: '6:00', home: 26, away: 16, quarter: 'Q1' },
      { timeSeconds: 396, time: '6:36', home: 28, away: 16, quarter: 'Q1' },
      { timeSeconds: 405, time: '6:45', home: 28, away: 18, quarter: 'Q1' },
      { timeSeconds: 448, time: '7:28', home: 28, away: 21, quarter: 'Q1' },
      { timeSeconds: 515, time: '8:35', home: 28, away: 24, quarter: 'Q1' },
      { timeSeconds: 545, time: '9:05', home: 28, away: 26, quarter: 'Q1' },
      { timeSeconds: 575, time: '9:35', home: 30, away: 26, quarter: 'Q1' },
      { timeSeconds: 605, time: '10:05', home: 30, away: 28, quarter: 'Q1' },
      { timeSeconds: 636, time: '10:36', home: 32, away: 28, quarter: 'Q1' },
      { timeSeconds: 656, time: '10:56', home: 32, away: 31, quarter: 'Q1' },
      { timeSeconds: 688, time: '11:28', home: 32, away: 33, quarter: 'Q1' },
      { timeSeconds: 701, time: '11:41', home: 34, away: 33, quarter: 'Q1' },
    ];
    
    const processed = processGameData(sample);
    setGameData(processed);
    setSelectedTime(processed.length - 1);
  };

  const exportCSV = () => {
    if (gameData.length === 0) return;
    
    let csv = 'time,home,away,total,predictedTotal,velocity,error\n';
    gameData.forEach(point => {
      csv += `${point.time},${point.home},${point.away},${point.total},${point.predictedTotal},${point.velocity.toFixed(2)},${point.error}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'basketball_predictions.csv';
    a.click();
  };

  useEffect(() => {
    if (gameData.length > 0) {
      const rawData = gameData.map(d => ({
        timeSeconds: d.timeSeconds,
        time: d.time,
        home: d.home,
        away: d.away,
        quarter: d.quarter,
        play: d.play || ''
      }));
      const processed = processGameData(rawData);
      setGameData(processed);
    }
  }, [velocityWindow]);

  // Auto-update team names when historical data is pasted
  useEffect(() => {
    if (homeTeamHistory) {
      const detectedTeam = extractTeamName(homeTeamHistory);
      if (detectedTeam && detectedTeam !== homeTeam) {
        setHomeTeam(detectedTeam);
      }
    }
  }, [homeTeamHistory]);

  useEffect(() => {
    if (awayTeamHistory) {
      const detectedTeam = extractTeamName(awayTeamHistory);
      if (detectedTeam && detectedTeam !== awayTeam) {
        setAwayTeam(detectedTeam);
      }
    }
  }, [awayTeamHistory]);

  const currentPoint = selectedTime !== null && gameData[selectedTime] ? gameData[selectedTime] : null;
  const finalActual = gameData.length > 0 ? gameData[gameData.length - 1].total : 0;

  // Calculate average prediction accuracy
  const avgAccuracy = gameData.length > 0 
    ? (100 - (gameData.reduce((sum, p) => sum + p.error, 0) / gameData.length / finalActual * 100)).toFixed(1)
    : 0;

  // Extract team name from historical data input
  const extractTeamName = (input) => {
    if (!input.trim()) return null;
    
    const lines = input.trim().split('\n');
    
    // Look for team name in first few lines
    // Patterns: "Houston Rockets Schedule", "Team Name Schedule", etc.
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();
      
      // Look for "Team Name Schedule" pattern (most reliable)
      const scheduleMatch = line.match(/(.+?)\s+Schedule/i);
      if (scheduleMatch) {
        let teamName = scheduleMatch[1].trim();
        // Clean up common prefixes/suffixes
        teamName = teamName.replace(/^(More\s+)?(NBA\s+)?(Teams\s+)?/i, '').trim();
        // Remove year patterns like "2025-26"
        teamName = teamName.replace(/\s+\d{4}-\d{2}$/i, '').trim();
        if (teamName) {
          return teamName;
        }
      }
      
      // Look for standalone team names (common NBA team patterns) - match anywhere in line
      const teamPatterns = [
        /(Houston|Boston|Chicago|Cleveland|Dallas|Denver|Detroit|Golden State|Indiana|LA|Los Angeles|Memphis|Miami|Milwaukee|Minnesota|New Orleans|New York|Oklahoma City|Orlando|Philadelphia|Phoenix|Portland|Sacramento|San Antonio|Toronto|Utah|Washington|Atlanta|Brooklyn|Charlotte)\s+(Rockets|Celtics|Bulls|Cavaliers|Mavericks|Nuggets|Pistons|Warriors|Pacers|Clippers|Lakers|Grizzlies|Heat|Bucks|Timberwolves|Pelicans|Knicks|Thunder|Magic|76ers|Suns|Trail Blazers|Kings|Spurs|Raptors|Jazz|Wizards|Hawks|Nets|Hornets)/i
      ];
      
      for (const pattern of teamPatterns) {
        const match = line.match(pattern);
        if (match) {
          return match[0].trim();
        }
      }
    }
    
    return null;
  };

  // Parse historical game scores from ESPN schedule format
  const parseHistoricalScores = (input, isHomeTeam = true) => {
    if (!input.trim()) return [];
    
    // Try ESPN schedule format first (DATE	OPPONENT	RESULT	W-L	...)
    const lines = input.trim().split('\n');
    const scores = [];
    
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      // Skip header row (looks for DATE, OPPONENT, RESULT columns)
      if (line.toUpperCase().includes('DATE') && (line.toUpperCase().includes('OPPONENT') || line.toUpperCase().includes('RESULT'))) {
        continue;
      }
      
      // Handle tab-separated or space-separated values
      // ESPN format typically has: DATE	OPPONENT	RESULT	W-L	...
      // Where RESULT is like "W131-124" or "L119-111"
      let parts = line.split('\t');
      if (parts.length < 3) {
        // Try splitting by multiple spaces
        parts = line.split(/\s{2,}/);
      }
      
      // Look for RESULT column (usually 3rd column, contains W/L followed by scores)
      // Format: "W131-124" or "L119-111" or "W130-116 OT"
      let resultColumn = null;
      
      // Try to find the RESULT column (contains W or L followed by scores)
      for (let part of parts) {
        const trimmed = part.trim();
        // Look for pattern: W/L followed by digits-digits
        if (/^[WL]\d+-\d+/.test(trimmed)) {
          resultColumn = trimmed;
          break;
        }
      }
      
      // If not found in parts, search the whole line
      if (!resultColumn) {
        const resultMatch = line.match(/([WL])(\d+)-(\d+)/);
        if (resultMatch) {
          resultColumn = resultMatch[0];
        }
      }
      
      if (resultColumn) {
        // Extract scores from result column (e.g., "W131-124" or "L119-111 OT")
        const resultMatch = resultColumn.match(/([WL])(\d+)-(\d+)/);
        if (resultMatch) {
          const result = resultMatch[1]; // W or L
          const score1 = parseInt(resultMatch[2]);
          const score2 = parseInt(resultMatch[3]);
          
          // In ESPN format: W131-124 means win 131-124 (team score first)
          // L119-111 means loss 119-111 (team score is first number, opponent is second)
          // Wait, let me reconsider: L119-111 means the team lost, so opponent had 119, team had 111
          // So for losses, team score is second number
          let teamScore;
          if (result === 'W') {
            // Win: team score is first number
            teamScore = score1;
          } else {
            // Loss: team score is second number (opponent scored more)
            teamScore = score2;
          }
          
          if (!isNaN(teamScore) && teamScore > 0 && teamScore >= 70 && teamScore <= 200) {
            scores.push(teamScore);
          }
          continue;
        }
      }
      
      // Fallback: try to find numbers that look like scores (100-250 range)
      // Look for 3-digit numbers that could be scores
      const numbers = line.match(/\b(\d{3})\b/g);
      if (numbers) {
        for (let num of numbers) {
          const score = parseInt(num);
          if (score >= 80 && score <= 200) { // Reasonable score range
            scores.push(score);
            break; // Take first reasonable score
          }
        }
      }
    }
    
    // If no ESPN format found, try simple comma/space separated numbers
    if (scores.length === 0) {
      const simpleScores = input.trim().split(/[,\s\n]+/).map(s => parseFloat(s.trim())).filter(s => !isNaN(s) && s > 0 && s >= 80 && s <= 200);
      return simpleScores;
    }
    
    return scores;
  };

  const homeTeamScores = parseHistoricalScores(homeTeamHistory, true);
  const awayTeamScores = parseHistoricalScores(awayTeamHistory, false);

  // Calculate historical statistics
  const calculateHistoricalStats = (scores) => {
    if (scores.length === 0) return null;
    
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0 
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    // Recent trend (last 5 games vs previous 5)
    const recent5 = scores.slice(0, 5);
    const previous5 = scores.slice(5, 10);
    const recentAvg = recent5.length > 0 ? recent5.reduce((sum, s) => sum + s, 0) / recent5.length : avg;
    const previousAvg = previous5.length > 0 ? previous5.reduce((sum, s) => sum + s, 0) / previous5.length : avg;
    const trend = recentAvg - previousAvg;
    
    return {
      avg: Math.round(avg * 10) / 10,
      median: Math.round(median * 10) / 10,
      min,
      max,
      stdDev: Math.round(stdDev * 10) / 10,
      count: scores.length,
      recentAvg: Math.round(recentAvg * 10) / 10,
      trend: Math.round(trend * 10) / 10,
      scores
    };
  };

  const homeStats = calculateHistoricalStats(homeTeamScores);
  const awayStats = calculateHistoricalStats(awayTeamScores);

  // Calculate combined historical total
  const calculateHistoricalTotal = () => {
    if (!homeStats || !awayStats) return null;
    
    const combinedAvg = homeStats.avg + awayStats.avg;
    const combinedStdDev = Math.sqrt(Math.pow(homeStats.stdDev, 2) + Math.pow(awayStats.stdDev, 2));
    
    return {
      avg: Math.round(combinedAvg * 10) / 10,
      stdDev: Math.round(combinedStdDev * 10) / 10,
      min: homeStats.min + awayStats.min,
      max: homeStats.max + awayStats.max
    };
  };

  const historicalTotal = calculateHistoricalTotal();

  // Calculate base confidence for current prediction
  const calculateBaseConfidence = () => {
    if (!currentPoint || gameData.length < 5) return 0;
    
    // Calculate error variance to assess prediction stability
    const errors = gameData.map(p => p.error);
    const avgError = errors.reduce((sum, e) => sum + e, 0) / errors.length;
    const errorVariance = errors.reduce((sum, e) => sum + Math.pow(e - avgError, 2), 0) / errors.length;
    const errorStdDev = Math.sqrt(errorVariance);
    
    // Base confidence factors:
    // 1. Amount of data (more data = higher confidence)
    const dataFactor = Math.min(1, gameData.length / 30); // Max at 30+ data points
    
    // 2. Error stability (lower variance = higher confidence)
    const stabilityFactor = Math.max(0.3, 1 - (errorStdDev / (finalActual || 100)));
    
    // 3. Current error relative to average (lower relative error = higher confidence)
    const currentErrorRatio = currentPoint.error / (avgError || 1);
    const errorFactor = Math.max(0.4, 1 - (currentErrorRatio - 1) * 0.3);
    
    // 4. Time remaining (more time = less confidence due to uncertainty)
    const timeRemaining = TOTAL_GAME_TIME - currentPoint.timeSeconds;
    const timeFactor = Math.max(0.5, 1 - (timeRemaining / TOTAL_GAME_TIME) * 0.3);
    
    // 5. Quarter-specific adjustments (later quarters = more confidence)
    const quarterNum = parseInt(currentPoint.quarter.replace('Q', '')) || 1;
    const quarterFactor = Math.min(1.1, 0.7 + (quarterNum * 0.1)); // Q1: 0.8, Q2: 0.9, Q3: 1.0, Q4: 1.1
    
    // 6. Betting line alignment factor (if betting lines are provided)
    let bettingFactor = 1.0; // Neutral if no betting data
    if (overUnderLine && overUnderConfidence) {
      const bettingLine = parseFloat(overUnderLine);
      const bettingConf = parseFloat(overUnderConfidence) / 100;
      const ourPrediction = currentPoint.predictedTotal;
      const distanceFromLine = Math.abs(ourPrediction - bettingLine);
      
      // If we have both low and high betting points, use interpolation
      if (overUnderHigh && overUnderHighConfidence) {
        const highLine = parseFloat(overUnderHigh);
        const highConf = parseFloat(overUnderHighConfidence) / 100;
        
        // Interpolate confidence based on where our prediction falls
        if (ourPrediction >= bettingLine && ourPrediction <= highLine) {
          // Our prediction is between the two betting points
          const range = highLine - bettingLine;
          if (range > 0) {
            const position = (ourPrediction - bettingLine) / range;
            // Interpolate confidence: bettingLine has bettingConf, highLine has highConf
            // Lower confidence at highLine means it's less likely, so we scale down
            const interpolatedConf = bettingConf - (bettingConf - highConf) * position;
            // Convert betting confidence to factor (90% betting conf = high trust)
            bettingFactor = 0.7 + (interpolatedConf * 0.3);
          }
        } else if (ourPrediction < bettingLine) {
          // Below betting line - closer to line = higher confidence
          const distanceRatio = Math.min(1, distanceFromLine / 30);
          bettingFactor = 0.6 + (bettingConf * 0.4 * (1 - distanceRatio * 0.5));
        } else {
          // Above high line - further above = lower confidence (high line has low conf)
          const distanceAbove = ourPrediction - highLine;
          const distanceRatio = Math.min(1, distanceAbove / 30);
          bettingFactor = 0.5 + (highConf * 0.5 * (1 - distanceRatio));
        }
      } else {
        // Only have one betting line
        const maxDistance = 50; // Points
        const alignmentScore = Math.max(0, 1 - (distanceFromLine / maxDistance));
        // Weight by betting confidence - higher betting confidence = more trust
        bettingFactor = 0.7 + (alignmentScore * 0.3 * bettingConf);
      }
    }
    
    // 7. Historical data alignment factor
    let historicalFactor = 1.0;
    if (historicalTotal) {
      const predictedTotal = currentPoint.predictedTotal;
      const historicalAvg = historicalTotal.avg;
      const difference = Math.abs(predictedTotal - historicalAvg);
      const stdDev = historicalTotal.stdDev;
      
      // If prediction is within 1 std dev of historical average, boost confidence
      // If far from historical average, reduce confidence
      if (difference < stdDev) {
        historicalFactor = 1.05; // Slight boost
      } else if (difference < 2 * stdDev) {
        historicalFactor = 0.95; // Slight reduction
      } else {
        historicalFactor = 0.85; // Significant reduction
      }
    }
    
    // Combine factors (reduced weight on betting factor to 12%, historical to 8%)
    const baseConfidence = (dataFactor * 0.2 + stabilityFactor * 0.25 + errorFactor * 0.2 + timeFactor * 0.15 + quarterFactor * 0.2 + bettingFactor * 0.12 + historicalFactor * 0.08) * 100;
    
    return Math.max(30, Math.min(95, baseConfidence)); // Clamp between 30% and 95%
  };

  // Calculate confidence that score will be at least X points
  const calculateConfidenceForScore = (targetScore) => {
    if (!currentPoint) return 0;
    
    const predictedTotal = currentPoint.predictedTotal;
    const baseConfidence = calculateBaseConfidence() / 100;
    
    // Calculate how many points below prediction
    const pointsBelow = predictedTotal - targetScore;
    
    if (pointsBelow <= 0) {
      // If target is above prediction, confidence decreases rapidly
      return Math.max(0, baseConfidence * 0.5);
    }
    
    // Calculate error distribution (assume normal distribution)
    // Use historical error patterns to estimate standard deviation
    const errors = gameData.map(p => p.error);
    const avgError = errors.reduce((sum, e) => sum + e, 0) / errors.length;
    const errorStdDev = Math.sqrt(
      errors.reduce((sum, e) => sum + Math.pow(e - avgError, 2), 0) / errors.length
    ) || avgError * 0.5; // Fallback to 50% of average error
    
    // Calculate z-score (how many standard deviations below prediction)
    const zScore = pointsBelow / (errorStdDev || 10);
    
    // Simplified CDF approximation
    let confidence;
    if (zScore <= 0) {
      confidence = baseConfidence * 0.5;
    } else if (zScore <= 1) {
      // Within 1 std dev: confidence increases linearly
      confidence = baseConfidence + (1 - baseConfidence) * zScore * 0.3;
    } else if (zScore <= 2) {
      // 1-2 std devs: confidence increases more
      confidence = baseConfidence + (1 - baseConfidence) * (0.3 + (zScore - 1) * 0.4);
    } else {
      // More than 2 std devs: high confidence
      confidence = baseConfidence + (1 - baseConfidence) * 0.9;
    }
    
    return Math.max(0, Math.min(99, confidence * 100));
  };

  // Generate confidence intervals for scores 2, 4, 6... 20 points below
  const confidenceIntervals = [];
  if (currentPoint) {
    for (let pointsDown = 2; pointsDown <= 20; pointsDown += 2) {
      const targetScore = currentPoint.predictedTotal - pointsDown;
      const confidence = calculateConfidenceForScore(targetScore);
      confidenceIntervals.push({
        pointsDown,
        targetScore,
        confidence: Math.round(confidence)
      });
    }
  }

  // Calculate confidence for specific betting score
  const calculateBettingConfidence = () => {
    if (!currentPoint || !bettingScore || !bettingCost) return null;
    
    const targetScore = parseFloat(bettingScore);
    const cost = parseFloat(bettingCost);
    
    if (isNaN(targetScore) || isNaN(cost) || cost <= 0) return null;
    
    // Calculate confidence that score will be at least targetScore
    const confidence = calculateConfidenceForScore(targetScore);
    
    // Calculate implied probability from betting cost
    // If you bet $cost to win $1 total (including stake back)
    // Profit if win = $1 - $cost
    // Implied probability = cost / (cost + profit) = cost / 1 = cost
    // Example: bet $0.90 to win $1 → implied prob = 0.90 = 90%
    const impliedProbability = cost * 100;
    
    // Calculate expected value
    // If you win: profit = $1 - $cost
    // If you lose: loss = $cost
    // EV = (confidence/100) * ($1 - $cost) - ((1 - confidence/100) * $cost)
    // EV = (confidence/100) - $cost
    const expectedValue = (confidence / 100) - cost;
    
    return {
      targetScore,
      cost,
      confidence: Math.round(confidence),
      impliedProbability: Math.round(impliedProbability * 10) / 10,
      expectedValue: Math.round(expectedValue * 100) / 100,
      recommendation: confidence > impliedProbability ? 'favorable' : confidence < impliedProbability ? 'unfavorable' : 'neutral'
    };
  };

  const bettingAnalysis = calculateBettingConfidence();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">
            🏀 Basketball Score Predictor
          </h1>
          <p className="text-purple-200 text-lg">
            Analyze real NBA games with velocity-based predictions
          </p>
          <p className="text-purple-300 text-sm mt-2">
            Formula: Final Score = Current Score + (Velocity × Time Remaining)
          </p>
        </div>

        {gameData.length === 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-8 mb-6 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-6">Load Game Data</h2>
            
            <div className="mb-6">
              <button
                onClick={loadSampleData}
                className="w-full px-6 py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl hover:from-emerald-500 hover:to-emerald-600 transition font-semibold shadow-lg flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-5 h-5" />
                Load Sample: Bulls vs Cavaliers Q1 (Dec 17, 2024)
              </button>
            </div>

            <div className="mb-6 bg-green-900/30 rounded-xl p-6 border border-green-500/30">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-green-400" />
                Paste by Quarter (Recommended)
              </h3>
              <p className="text-gray-300 text-sm mb-4">
                Paste each quarter's data separately for better accuracy
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="text-white font-semibold text-sm mb-2 block">First Quarter</label>
                  <textarea
                    value={q1Input}
                    onChange={(e) => setQ1Input(e.target.value)}
                    placeholder="Paste Q1 data here..."
                    className="w-full h-32 p-3 bg-black/40 text-white rounded-lg border border-white/20 font-mono text-xs focus:outline-none focus:border-green-400"
                  />
                </div>
                <div>
                  <label className="text-white font-semibold text-sm mb-2 block">Second Quarter</label>
                  <textarea
                    value={q2Input}
                    onChange={(e) => setQ2Input(e.target.value)}
                    placeholder="Paste Q2 data here..."
                    className="w-full h-32 p-3 bg-black/40 text-white rounded-lg border border-white/20 font-mono text-xs focus:outline-none focus:border-green-400"
                  />
                </div>
                <div>
                  <label className="text-white font-semibold text-sm mb-2 block">Third Quarter</label>
                  <textarea
                    value={q3Input}
                    onChange={(e) => setQ3Input(e.target.value)}
                    placeholder="Paste Q3 data here..."
                    className="w-full h-32 p-3 bg-black/40 text-white rounded-lg border border-white/20 font-mono text-xs focus:outline-none focus:border-green-400"
                  />
                </div>
                <div>
                  <label className="text-white font-semibold text-sm mb-2 block">Fourth Quarter</label>
                  <textarea
                    value={q4Input}
                    onChange={(e) => setQ4Input(e.target.value)}
                    placeholder="Paste Q4 data here..."
                    className="w-full h-32 p-3 bg-black/40 text-white rounded-lg border border-white/20 font-mono text-xs focus:outline-none focus:border-green-400"
                  />
                </div>
              </div>
              <button
                onClick={handleQuarterInput}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition font-semibold"
              >
                Process Quarter Data
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-black/30 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  Paste All Data at Once
                </h3>
                <textarea
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Enter data (one per line):
0:43,2,0
2:16,9,4
4:30,20,16
...

Format: time,home_score,away_score"
                  className="w-full h-64 p-4 bg-black/40 text-white rounded-lg border border-white/20 font-mono text-sm focus:outline-none focus:border-purple-400 mb-4"
                />
                <button
                  onClick={handleManualInput}
                  className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition font-semibold"
                >
                  Process Data
                </button>
              </div>

              <div className="bg-black/30 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-400" />
                  Upload CSV File
                </h3>
                <div className="mb-4">
                  <p className="text-gray-300 text-sm mb-3">
                    Upload a CSV with: time, home_score, away_score
                  </p>
                  <div className="bg-black/40 rounded-lg p-6 border-2 border-dashed border-white/30 text-center">
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition font-semibold"
                    >
                      Choose File
                    </label>
                  </div>
                </div>
                <div className="bg-black/40 rounded-lg p-4 text-xs text-gray-400 font-mono">
                  <div className="font-semibold text-gray-300 mb-2">Example CSV:</div>
                  time,home,away<br/>
                  0:43,2,0<br/>
                  2:16,9,4<br/>
                  4:30,20,16
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 bg-red-500/20 border border-red-500 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-200">{error}</p>
              </div>
            )}

            <div className="mt-6 bg-blue-900/30 rounded-xl p-6 border border-blue-500/30">
              <h4 className="text-white font-bold mb-3">🎯 How to Get ESPN Data:</h4>
              <ol className="text-blue-200 space-y-2 text-sm list-decimal list-inside">
                <li>Go to ESPN.com and find a completed NBA game</li>
                <li>Click "Play-by-Play" tab</li>
                <li>Copy the table data (time and scores)</li>
                <li>Paste into the manual input box above</li>
              </ol>
              <p className="text-blue-300 text-xs mt-4">
                Example: <span className="font-mono">espn.com/nba/playbyplay/_/gameId/401810222</span>
              </p>
            </div>

            {/* Historical Data Input - Available before game data */}
            <div className="mt-6 bg-purple-900/30 rounded-xl p-6 border border-purple-500/30">
              <h3 className="text-xl font-bold text-white mb-4">Historical Game Data (Optional - Improves Predictions)</h3>
              <p className="text-gray-300 text-sm mb-3">
                Paste ESPN schedule data for both teams to improve prediction accuracy. Copy the entire schedule table including headers.
              </p>
              <div className="bg-blue-900/30 rounded-lg p-3 mb-4 text-xs text-blue-200">
                <div className="font-semibold mb-1">Example format:</div>
                <div className="font-mono text-xs">DATE	OPPONENT	RESULT	W-L	...</div>
                <div className="font-mono text-xs mt-1">Wed, 10/22	@ NY	L119-111	0-1	...</div>
                <div className="font-mono text-xs">Fri, 10/24	@ BKN	W131-124	1-1	...</div>
                <div className="text-gray-400 mt-2">The parser will extract scores from the RESULT column (e.g., W131-124 or L119-111)</div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-300 text-sm font-semibold mb-2 block">
                    {homeTeam} Past Games
                    {homeTeamHistory && extractTeamName(homeTeamHistory) && extractTeamName(homeTeamHistory) !== homeTeam && (
                      <span className="ml-2 text-xs text-yellow-400">(Detected: {extractTeamName(homeTeamHistory)})</span>
                    )}
                  </label>
                  <textarea
                    value={homeTeamHistory}
                    onChange={(e) => {
                      const value = e.target.value;
                      setHomeTeamHistory(value);
                      // Auto-detect team name from input
                      const detectedTeam = extractTeamName(value);
                      if (detectedTeam && detectedTeam !== homeTeam) {
                        setHomeTeam(detectedTeam);
                      }
                    }}
                    placeholder={`Paste ${homeTeam} ESPN schedule data here...\n\nExample:\nDATE\tOPPONENT\tRESULT\tW-L\t...\nWed, 10/22\t@ NY\tL119-111\t0-1\t...\nFri, 10/24\t@ BKN\tW131-124\t1-1\t...`}
                    className="w-full h-64 p-3 bg-black/40 text-white rounded-lg border border-white/20 font-mono text-xs focus:outline-none focus:border-purple-400 resize-y"
                  />
                  {homeTeamScores.length > 0 && (
                    <div className="mt-2 text-xs text-green-400">
                      ✓ Parsed {homeTeamScores.length} games
                      {homeStats && (
                        <span className="ml-2 text-gray-400">
                          (Avg: {homeStats.avg}, Range: {homeStats.min}-{homeStats.max})
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-gray-300 text-sm font-semibold mb-2 block">
                    {awayTeam} Past Games
                    {awayTeamHistory && extractTeamName(awayTeamHistory) && extractTeamName(awayTeamHistory) !== awayTeam && (
                      <span className="ml-2 text-xs text-yellow-400">(Detected: {extractTeamName(awayTeamHistory)})</span>
                    )}
                  </label>
                  <textarea
                    value={awayTeamHistory}
                    onChange={(e) => {
                      const value = e.target.value;
                      setAwayTeamHistory(value);
                      // Auto-detect team name from input
                      const detectedTeam = extractTeamName(value);
                      if (detectedTeam && detectedTeam !== awayTeam) {
                        setAwayTeam(detectedTeam);
                      }
                    }}
                    placeholder={`Paste ${awayTeam} ESPN schedule data here...\n\nExample:\nDATE\tOPPONENT\tRESULT\tW-L\t...\nWed, 10/22\t@ NY\tL119-111\t0-1\t...\nFri, 10/24\t@ BKN\tW131-124\t1-1\t...`}
                    className="w-full h-64 p-3 bg-black/40 text-white rounded-lg border border-white/20 font-mono text-xs focus:outline-none focus:border-purple-400 resize-y"
                  />
                  {awayTeamScores.length > 0 && (
                    <div className="mt-2 text-xs text-green-400">
                      ✓ Parsed {awayTeamScores.length} games
                      {awayStats && (
                        <span className="ml-2 text-gray-400">
                          (Avg: {awayStats.avg}, Range: {awayStats.min}-{awayStats.max})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Show preview of historical stats even before game data is loaded */}
              {(homeStats || awayStats) && (
                <div className="mt-4 bg-indigo-900/30 rounded-lg p-4 border border-indigo-500/30">
                  <div className="text-indigo-300 text-sm font-semibold mb-3">Historical Data Preview</div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {homeStats && (
                      <div className="bg-black/30 rounded-lg p-3">
                        <div className="text-orange-300 font-semibold text-sm mb-2">{homeTeam}</div>
                        <div className="text-xs text-gray-400 space-y-1">
                          <div>Average: <span className="text-white font-semibold">{homeStats.avg}</span> points</div>
                          <div>Range: <span className="text-white">{homeStats.min}-{homeStats.max}</span> | Median: <span className="text-white">{homeStats.median}</span></div>
                          <div>Std Dev: <span className="text-white">{homeStats.stdDev}</span> | Games: <span className="text-white">{homeStats.count}</span></div>
                          {homeStats.trend !== 0 && (
                            <div>Recent Trend: <span className={homeStats.trend >= 0 ? 'text-green-400' : 'text-red-400'}>{homeStats.trend >= 0 ? '+' : ''}{homeStats.trend}</span> pts/game</div>
                          )}
                        </div>
                      </div>
                    )}
                    {awayStats && (
                      <div className="bg-black/30 rounded-lg p-3">
                        <div className="text-blue-300 font-semibold text-sm mb-2">{awayTeam}</div>
                        <div className="text-xs text-gray-400 space-y-1">
                          <div>Average: <span className="text-white font-semibold">{awayStats.avg}</span> points</div>
                          <div>Range: <span className="text-white">{awayStats.min}-{awayStats.max}</span> | Median: <span className="text-white">{awayStats.median}</span></div>
                          <div>Std Dev: <span className="text-white">{awayStats.stdDev}</span> | Games: <span className="text-white">{awayStats.count}</span></div>
                          {awayStats.trend !== 0 && (
                            <div>Recent Trend: <span className={awayStats.trend >= 0 ? 'text-green-400' : 'text-red-400'}>{awayStats.trend >= 0 ? '+' : ''}{awayStats.trend}</span> pts/game</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {historicalTotal && (
                    <div className="mt-3 pt-3 border-t border-indigo-500/30">
                      <div className="text-indigo-300 text-sm font-semibold mb-1">Combined Historical Average</div>
                      <div className="text-white text-lg font-bold">{historicalTotal.avg} total points</div>
                      <div className="text-gray-400 text-xs">(Std Dev: {historicalTotal.stdDev})</div>
                    </div>
                  )}
                  <div className="mt-3 text-xs text-gray-400 italic">
                    💡 Historical analysis will be integrated into predictions once you load game data
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {gameData.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <input
                type="text"
                value={homeTeam}
                onChange={(e) => setHomeTeam(e.target.value)}
                className="text-center p-4 rounded-xl bg-white/10 backdrop-blur border-2 border-orange-400 font-bold text-xl text-white placeholder-purple-300 focus:outline-none focus:border-orange-300"
              />
              <input
                type="text"
                value={awayTeam}
                onChange={(e) => setAwayTeam(e.target.value)}
                className="text-center p-4 rounded-xl bg-white/10 backdrop-blur border-2 border-blue-400 font-bold text-xl text-white placeholder-purple-300 focus:outline-none focus:border-blue-300"
              />
            </div>

            {currentPoint && (
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-8 mb-6 border border-white/20">
                <div className="text-center mb-6">
                  <div className="inline-block bg-black/40 rounded-2xl px-8 py-4">
                    <div className="text-purple-400 text-sm font-semibold mb-1">{currentPoint.quarter}</div>
                    <div className="text-white text-6xl font-bold font-mono">{currentPoint.time}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6 mb-6">
                  <div className="text-center">
                    <div className="text-orange-300 text-lg font-semibold mb-2">{homeTeam}</div>
                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 mb-2">
                      <div className="text-white text-6xl font-bold">{currentPoint.home}</div>
                    </div>
                    <div className="bg-black/30 rounded-xl p-3">
                      <div className="text-emerald-400 text-xs font-semibold">Predicted Final</div>
                      <div className="text-white text-2xl font-bold">{currentPoint.predictedHome}</div>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-purple-300 text-lg font-semibold mb-2">Total Points</div>
                    <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 mb-2">
                      <div className="text-white text-6xl font-bold">{currentPoint.total}</div>
                    </div>
                    <div className="bg-black/30 rounded-xl p-3">
                      <div className="text-emerald-400 text-xs font-semibold">Predicted Final</div>
                      <div className="text-white text-2xl font-bold">{currentPoint.predictedTotal}</div>
                      <div className="text-gray-400 text-xs mt-1">Actual: {finalActual}</div>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-blue-300 text-lg font-semibold mb-2">{awayTeam}</div>
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 mb-2">
                      <div className="text-white text-6xl font-bold">{currentPoint.away}</div>
                    </div>
                    <div className="bg-black/30 rounded-xl p-3">
                      <div className="text-emerald-400 text-xs font-semibold">Predicted Final</div>
                      <div className="text-white text-2xl font-bold">{currentPoint.predictedAway}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-black/30 rounded-xl p-4 text-center">
                    <div className="text-yellow-400 text-xs font-semibold mb-1">Velocity</div>
                    <div className="text-white text-3xl font-bold">{currentPoint.velocity.toFixed(1)}</div>
                    <div className="text-gray-400 text-xs">pts/min</div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-4 text-center">
                    <div className="text-cyan-400 text-xs font-semibold mb-1">Error</div>
                    <div className="text-white text-3xl font-bold">{currentPoint.error}</div>
                    <div className="text-gray-400 text-xs">points</div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-4 text-center">
                    <div className="text-pink-400 text-xs font-semibold mb-1">Accuracy</div>
                    <div className="text-white text-3xl font-bold">
                      {(100 - (currentPoint.error / finalActual * 100)).toFixed(1)}%
                    </div>
                    <div className="text-gray-400 text-xs">prediction</div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-4 text-center">
                    <div className="text-emerald-400 text-xs font-semibold mb-1">Avg Accuracy</div>
                    <div className="text-white text-3xl font-bold">{avgAccuracy}%</div>
                    <div className="text-gray-400 text-xs">overall</div>
                  </div>
                </div>

                {/* Betting Lines Section */}
                <div className="mt-6 bg-purple-900/30 rounded-xl p-6 border border-purple-500/30">
                  <h3 className="text-xl font-bold text-white mb-4">Betting Line Comparison (Optional)</h3>
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-gray-300 text-sm font-semibold mb-2 block">Low Line (Score)</label>
                      <input
                        type="number"
                        value={overUnderLine}
                        onChange={(e) => setOverUnderLine(e.target.value)}
                        placeholder="e.g., 209.5"
                        className="w-full p-3 bg-black/40 text-white rounded-lg border border-white/20 focus:outline-none focus:border-purple-400"
                      />
                    </div>
                    <div>
                      <label className="text-gray-300 text-sm font-semibold mb-2 block">Low Confidence (%)</label>
                      <input
                        type="number"
                        value={overUnderConfidence}
                        onChange={(e) => setOverUnderConfidence(e.target.value)}
                        placeholder="e.g., 90"
                        className="w-full p-3 bg-black/40 text-white rounded-lg border border-white/20 focus:outline-none focus:border-purple-400"
                      />
                    </div>
                    <div>
                      <label className="text-gray-300 text-sm font-semibold mb-2 block">High Line (Score)</label>
                      <input
                        type="number"
                        value={overUnderHigh}
                        onChange={(e) => setOverUnderHigh(e.target.value)}
                        placeholder="e.g., 239"
                        className="w-full p-3 bg-black/40 text-white rounded-lg border border-white/20 focus:outline-none focus:border-purple-400"
                      />
                    </div>
                    <div>
                      <label className="text-gray-300 text-sm font-semibold mb-2 block">High Confidence (%)</label>
                      <input
                        type="number"
                        value={overUnderHighConfidence}
                        onChange={(e) => setOverUnderHighConfidence(e.target.value)}
                        placeholder="e.g., 26"
                        className="w-full p-3 bg-black/40 text-white rounded-lg border border-white/20 focus:outline-none focus:border-purple-400"
                      />
                    </div>
                  </div>
                  {overUnderLine && overUnderConfidence && (
                    <div className="bg-black/30 rounded-lg p-4">
                      <div className="text-purple-300 text-sm mb-2">Betting Market Alignment:</div>
                      <div className="text-white font-semibold">
                        {overUnderLine && overUnderConfidence && (
                          <span>Line {overUnderLine} at {overUnderConfidence}% confidence</span>
                        )}
                        {overUnderHigh && overUnderHighConfidence && (
                          <span> → Line {overUnderHigh} at {overUnderHighConfidence}% confidence</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Prediction Range & Confidence */}
                {currentPoint && (
                  <div className="mt-6 bg-emerald-900/30 rounded-xl p-6 border border-emerald-500/30">
                    <h3 className="text-xl font-bold text-white mb-4">Prediction Range & Confidence</h3>
                    <div className="grid md:grid-cols-2 gap-6 mb-4">
                      <div className="bg-black/30 rounded-lg p-4">
                        <div className="text-emerald-300 text-sm mb-2">Base Confidence</div>
                        <div className="text-white text-3xl font-bold">{Math.round(calculateBaseConfidence())}%</div>
                        <div className="text-gray-400 text-xs mt-1">Prediction: {currentPoint.predictedTotal} total points</div>
                      </div>
                      <div className="bg-black/30 rounded-lg p-4">
                        <div className="text-emerald-300 text-sm mb-2">Prediction Range</div>
                        <div className="text-white text-lg font-semibold">
                          {Math.max(150, currentPoint.predictedTotal - 20)} - {Math.min(350, currentPoint.predictedTotal + 20)} points
                        </div>
                      </div>
                    </div>
                    
                    {/* Visual Confidence Bar */}
                    <div className="mb-4">
                      <div className="text-gray-300 text-sm mb-2">Confidence Visualization</div>
                      <div className="h-6 bg-black/40 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 transition-all duration-500"
                          style={{ width: `${Math.round(calculateBaseConfidence())}%` }}
                        />
                      </div>
                    </div>

                    {/* Confidence Intervals */}
                    <div className="bg-black/30 rounded-lg p-4">
                      <div className="text-emerald-300 text-sm font-semibold mb-3">Confidence Intervals (Score At Least X Points)</div>
                      <div className="grid grid-cols-5 gap-2 text-xs">
                        {confidenceIntervals.map((interval, idx) => (
                          <div key={idx} className="bg-black/40 rounded p-2 text-center">
                            <div className="text-white font-bold">{interval.targetScore}</div>
                            <div className="text-emerald-400">{interval.confidence}%</div>
                            <div className="text-gray-500 text-xs">-{interval.pointsDown}pts</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Betting Calculator */}
                <div className="mt-6 bg-blue-900/30 rounded-xl p-6 border border-blue-500/30">
                  <h3 className="text-xl font-bold text-white mb-4">Betting Calculator</h3>
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-gray-300 text-sm font-semibold mb-2 block">Score to Bet</label>
                      <input
                        type="number"
                        value={bettingScore}
                        onChange={(e) => setBettingScore(e.target.value)}
                        placeholder="e.g., 209.5"
                        className="w-full p-3 bg-black/40 text-white rounded-lg border border-white/20 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-gray-300 text-sm font-semibold mb-2 block">Cost to Win $1</label>
                      <input
                        type="number"
                        step="0.01"
                        value={bettingCost}
                        onChange={(e) => setBettingCost(e.target.value)}
                        placeholder="e.g., 0.90"
                        className="w-full p-3 bg-black/40 text-white rounded-lg border border-white/20 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>
                  {bettingAnalysis && (
                    <div className="bg-black/30 rounded-lg p-4">
                      <div className="grid md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <div className="text-blue-300 text-xs mb-1">Your Confidence</div>
                          <div className="text-white text-2xl font-bold">{bettingAnalysis.confidence}%</div>
                        </div>
                        <div>
                          <div className="text-blue-300 text-xs mb-1">Implied Probability</div>
                          <div className="text-white text-2xl font-bold">{bettingAnalysis.impliedProbability}%</div>
                        </div>
                        <div>
                          <div className="text-blue-300 text-xs mb-1">Expected Value</div>
                          <div className={`text-2xl font-bold ${bettingAnalysis.expectedValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {bettingAnalysis.expectedValue >= 0 ? '+' : ''}{bettingAnalysis.expectedValue}
                          </div>
                        </div>
                        <div>
                          <div className="text-blue-300 text-xs mb-1">Recommendation</div>
                          <div className={`text-lg font-bold ${
                            bettingAnalysis.recommendation === 'favorable' ? 'text-green-400' : 
                            bettingAnalysis.recommendation === 'unfavorable' ? 'text-red-400' : 
                            'text-yellow-400'
                          }`}>
                            {bettingAnalysis.recommendation === 'favorable' ? '✓ Favorable' : 
                             bettingAnalysis.recommendation === 'unfavorable' ? '✗ Unfavorable' : 
                             '○ Neutral'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Historical Analysis */}
                {(homeTeamHistory || awayTeamHistory) && (
                  <div className="mt-6 bg-indigo-900/30 rounded-xl p-6 border border-indigo-500/30">
                    <h3 className="text-xl font-bold text-white mb-4">Historical Analysis</h3>
                    
                    {historicalTotal && currentPoint && (
                      <div className="bg-black/30 rounded-lg p-4 mb-4">
                        <div className="text-indigo-300 text-sm font-semibold mb-2">Combined Historical Average vs Current Prediction</div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-gray-400 text-xs">Historical Average</div>
                            <div className="text-white text-2xl font-bold">{historicalTotal.avg} points</div>
                            <div className="text-gray-500 text-xs">Std Dev: {historicalTotal.stdDev}</div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-xs">Current Prediction</div>
                            <div className="text-white text-2xl font-bold">{currentPoint.predictedTotal} points</div>
                            <div className={`text-xs font-semibold ${
                              Math.abs(currentPoint.predictedTotal - historicalTotal.avg) < historicalTotal.stdDev ? 'text-green-400' : 
                              Math.abs(currentPoint.predictedTotal - historicalTotal.avg) < 2 * historicalTotal.stdDev ? 'text-yellow-400' : 
                              'text-red-400'
                            }`}>
                              {Math.abs(currentPoint.predictedTotal - historicalTotal.avg) < historicalTotal.stdDev ? '✓ Within 1 std dev' : 
                               Math.abs(currentPoint.predictedTotal - historicalTotal.avg) < 2 * historicalTotal.stdDev ? '⚠ Within 2 std dev' : 
                               '✗ Outside 2 std dev'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      {homeStats && (
                        <div className="bg-black/30 rounded-lg p-4">
                          <div className="text-orange-300 font-semibold mb-2">{homeTeam}</div>
                          <div className="text-xs text-gray-400 space-y-1">
                            <div>Avg: <span className="text-white">{homeStats.avg}</span> | Median: <span className="text-white">{homeStats.median}</span></div>
                            <div>Range: <span className="text-white">{homeStats.min}-{homeStats.max}</span> | Std Dev: <span className="text-white">{homeStats.stdDev}</span></div>
                            <div>Recent Avg: <span className="text-white">{homeStats.recentAvg}</span> | Trend: <span className={homeStats.trend >= 0 ? 'text-green-400' : 'text-red-400'}>{homeStats.trend >= 0 ? '+' : ''}{homeStats.trend}</span></div>
                            <div className="text-gray-500 mt-2">({homeStats.count} games)</div>
                          </div>
                        </div>
                      )}
                      
                      {awayStats && (
                        <div className="bg-black/30 rounded-lg p-4">
                          <div className="text-blue-300 font-semibold mb-2">{awayTeam}</div>
                          <div className="text-xs text-gray-400 space-y-1">
                            <div>Avg: <span className="text-white">{awayStats.avg}</span> | Median: <span className="text-white">{awayStats.median}</span></div>
                            <div>Range: <span className="text-white">{awayStats.min}-{awayStats.max}</span> | Std Dev: <span className="text-white">{awayStats.stdDev}</span></div>
                            <div>Recent Avg: <span className="text-white">{awayStats.recentAvg}</span> | Trend: <span className={awayStats.trend >= 0 ? 'text-green-400' : 'text-red-400'}>{awayStats.trend >= 0 ? '+' : ''}{awayStats.trend}</span></div>
                            <div className="text-gray-500 mt-2">({awayStats.count} games)</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Historical Data Input */}
                <div className="mt-6 bg-purple-900/30 rounded-xl p-6 border border-purple-500/30">
                  <h3 className="text-xl font-bold text-white mb-4">Historical Game Data (Optional - Improves Predictions)</h3>
                  <p className="text-gray-300 text-sm mb-3">
                    Paste ESPN schedule data for both teams to improve prediction accuracy. Copy the entire schedule table including headers.
                  </p>
                  <div className="bg-blue-900/30 rounded-lg p-3 mb-4 text-xs text-blue-200">
                    <div className="font-semibold mb-1">Example format:</div>
                    <div className="font-mono text-xs">DATE	OPPONENT	RESULT	W-L	...</div>
                    <div className="font-mono text-xs mt-1">Wed, 10/22	@ NY	L119-111	0-1	...</div>
                    <div className="font-mono text-xs">Fri, 10/24	@ BKN	W131-124	1-1	...</div>
                    <div className="text-gray-400 mt-2">The parser will extract scores from the RESULT column (e.g., W131-124 or L119-111)</div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-gray-300 text-sm font-semibold mb-2 block">
                        {homeTeam} Past Games
                        {homeTeamHistory && extractTeamName(homeTeamHistory) && extractTeamName(homeTeamHistory) !== homeTeam && (
                          <span className="ml-2 text-xs text-yellow-400">(Detected: {extractTeamName(homeTeamHistory)})</span>
                        )}
                      </label>
                      <textarea
                        value={homeTeamHistory}
                        onChange={(e) => {
                          const value = e.target.value;
                          setHomeTeamHistory(value);
                          // Auto-detect team name from input
                          const detectedTeam = extractTeamName(value);
                          if (detectedTeam && detectedTeam !== homeTeam) {
                            setHomeTeam(detectedTeam);
                          }
                        }}
                        placeholder={`Paste ${homeTeam} ESPN schedule data here...\n\nExample:\nDATE\tOPPONENT\tRESULT\tW-L\t...\nWed, 10/22\t@ NY\tL119-111\t0-1\t...\nFri, 10/24\t@ BKN\tW131-124\t1-1\t...`}
                        className="w-full h-64 p-3 bg-black/40 text-white rounded-lg border border-white/20 font-mono text-xs focus:outline-none focus:border-purple-400 resize-y"
                      />
                      {homeTeamScores.length > 0 && (
                        <div className="mt-2 text-xs text-green-400">
                          ✓ Parsed {homeTeamScores.length} games
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-gray-300 text-sm font-semibold mb-2 block">
                        {awayTeam} Past Games
                        {awayTeamHistory && extractTeamName(awayTeamHistory) && extractTeamName(awayTeamHistory) !== awayTeam && (
                          <span className="ml-2 text-xs text-yellow-400">(Detected: {extractTeamName(awayTeamHistory)})</span>
                        )}
                      </label>
                      <textarea
                        value={awayTeamHistory}
                        onChange={(e) => {
                          const value = e.target.value;
                          setAwayTeamHistory(value);
                          // Auto-detect team name from input
                          const detectedTeam = extractTeamName(value);
                          if (detectedTeam && detectedTeam !== awayTeam) {
                            setAwayTeam(detectedTeam);
                          }
                        }}
                        placeholder={`Paste ${awayTeam} ESPN schedule data here...\n\nExample:\nDATE\tOPPONENT\tRESULT\tW-L\t...\nWed, 10/22\t@ NY\tL119-111\t0-1\t...\nFri, 10/24\t@ BKN\tW131-124\t1-1\t...`}
                        className="w-full h-64 p-3 bg-black/40 text-white rounded-lg border border-white/20 font-mono text-xs focus:outline-none focus:border-purple-400 resize-y"
                      />
                      {awayTeamScores.length > 0 && (
                        <div className="mt-2 text-xs text-green-400">
                          ✓ Parsed {awayTeamScores.length} games
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-center mb-3">
                    <label className="text-gray-300 text-sm font-semibold">
                      Game Timeline
                    </label>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={gameData.length - 1}
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(parseInt(e.target.value))}
                    className="w-full h-3 bg-gradient-to-r from-orange-500 via-purple-500 to-blue-500 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>{gameData[0].time}</span>
                    <span>{gameData[gameData.length - 1].time}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 border border-white/20">
              <div className="flex items-center justify-between mb-3">
                <label className="text-gray-300 text-sm font-semibold">
                  Velocity Window: {velocityWindow / 60} min
                </label>
                <button
                  onClick={exportCSV}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition font-semibold flex items-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>
              <input
                type="range"
                min="30"
                max="720"
                step="30"
                value={velocityWindow}
                onChange={(e) => setVelocityWindow(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>30s</span>
                <span>12 min</span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-6 border border-white/20">
                <h3 className="text-2xl font-bold text-white mb-4">Total Points: Actual vs Predicted</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={gameData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis dataKey="time" stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                    <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        border: '1px solid #374151',
                        borderRadius: '12px'
                      }}
                      labelStyle={{ color: '#9ca3af' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#a855f7"
                      strokeWidth={3}
                      name="Actual Total"
                      dot={{ fill: '#a855f7', r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="predictedTotal"
                      stroke="#10b981"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Predicted Total"
                      dot={{ fill: '#10b981', r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-6 border border-white/20">
                <h3 className="text-2xl font-bold text-white mb-4">Prediction Error Over Time</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={gameData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis dataKey="time" stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                    <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        border: '1px solid #374151',
                        borderRadius: '12px'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="error"
                      stroke="#ef4444"
                      strokeWidth={3}
                      name="Prediction Error (pts)"
                      dot={{ fill: '#ef4444', r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-6 border border-white/20">
                <h3 className="text-2xl font-bold text-white mb-4">Individual Team Scores</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={gameData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis dataKey="time" stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                    <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        border: '1px solid #374151',
                        borderRadius: '12px'
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="home"
                      stackId="1"
                      stroke="#f97316"
                      fill="#f97316"
                      fillOpacity={0.6}
                      name={homeTeam}
                    />
                    <Area
                      type="monotone"
                      dataKey="away"
                      stackId="1"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.6}
                      name={awayTeam}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-6 border border-white/20">
                <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                  <Zap className="w-6 h-6 text-yellow-400" />
                  Scoring Velocity Over Time
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={gameData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis dataKey="time" stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                    <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        border: '1px solid #374151',
                        borderRadius: '12px'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="velocity"
                      stroke="#fbbf24"
                      strokeWidth={3}
                      name="Velocity (pts/min)"
                      dot={{ fill: '#fbbf24', r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setGameData([]);
                  setSelectedTime(null);
                  setManualInput('');
                  setQ1Input('');
                  setQ2Input('');
                  setQ3Input('');
                  setQ4Input('');
                  setOverUnderLine('');
                  setOverUnderConfidence('');
                  setOverUnderHigh('');
                  setOverUnderHighConfidence('');
                  setBettingScore('');
                  setBettingCost('');
                  setHomeTeamHistory('');
                  setAwayTeamHistory('');
                  setError('');
                }}
                className="px-8 py-4 bg-red-600 text-white rounded-xl hover:bg-red-500 transition font-semibold shadow-lg"
              >
                Load New Game
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BasketballESPNPredictor;
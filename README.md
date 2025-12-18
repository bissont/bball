# 🏀 Basketball Score Predictor

A React web application that predicts NBA game scores using velocity-based analysis of ESPN play-by-play data.

## Features

- **Real-time Predictions**: Analyze live or completed games using play-by-play data
- **Quarter-by-Quarter Input**: Paste data for each quarter separately for better accuracy
- **Historical Analysis**: Integrate team historical data to improve predictions
- **Betting Calculator**: Calculate confidence, implied probability, and expected value for bets
- **Confidence Intervals**: See confidence levels for scores below your prediction
- **Visual Charts**: Interactive charts showing predictions, errors, and velocity over time

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment to GitHub Pages

This project is configured to automatically deploy to GitHub Pages when you push to the `main` branch.

### Setup Instructions

1. **Create a GitHub repository** (if you haven't already):
   ```bash
   cd ~/Documents/bbal
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/bbal.git
   git push -u origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Click **Settings** → **Pages**
   - Under "Source", select **GitHub Actions**
   - Save

3. **Update the base path** (if needed):
   - If your repository name is NOT "bbal", edit `vite.config.js`
   - Change `base: '/bbal/'` to match your repository name
   - For example, if repo is "basketball-predictor", use `base: '/basketball-predictor/'`

4. **Push changes**:
   ```bash
   git add .
   git commit -m "Your commit message"
   git push
   ```

The GitHub Actions workflow will automatically:
- Build your app
- Deploy it to GitHub Pages
- Make it available at: `https://YOUR_USERNAME.github.io/bbal/`

### Automatic Updates

Every time you push to the `main` branch, the site will automatically rebuild and update. Just commit and push:

```bash
git add .
git commit -m "Update features"
git push
```

The deployment typically takes 1-2 minutes. You can check the deployment status in the **Actions** tab of your GitHub repository.

## How to Use

1. **Load Game Data**:
   - Option 1: Paste quarter-by-quarter data (recommended)
   - Option 2: Paste all play-by-play data at once
   - Option 3: Upload a CSV file

2. **Add Historical Data** (optional):
   - Paste ESPN schedule data for both teams
   - This improves prediction accuracy

3. **View Predictions**:
   - See real-time predictions as you scroll through the game timeline
   - Check confidence intervals and betting analysis

## Data Format

### Play-by-Play Data
Copy from ESPN play-by-play page. Format:
```
TIME    PLAY                    HOME_SCORE  AWAY_SCORE
12:00   Start of 1st Quarter   0           0
11:17   Player makes shot      2           0
```

### Historical Data
Copy ESPN schedule table. Format:
```
DATE        OPPONENT    RESULT      W-L
Wed, 10/22  @ NY        L119-111    0-1
Fri, 10/24  @ BKN       W131-124    1-1
```

## Technologies

- React 19
- Vite
- Tailwind CSS
- Recharts
- Lucide React Icons

## License

MIT

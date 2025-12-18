#!/bin/bash

# Setup script for GitHub Pages deployment

echo "🏀 Basketball Predictor - GitHub Setup"
echo "======================================="
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "Initializing git repository..."
    git init
    git branch -M main
fi

# Add all files
echo "Adding files..."
git add .

# Check if remote exists
if git remote get-url origin &>/dev/null; then
    echo "Remote 'origin' already exists:"
    git remote get-url origin
    echo ""
    read -p "Do you want to change it? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your GitHub repository URL: " repo_url
        git remote set-url origin "$repo_url"
    fi
else
    echo "No remote repository configured."
    read -p "Enter your GitHub repository URL (e.g., https://github.com/username/bbal.git): " repo_url
    git remote add origin "$repo_url"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Make your first commit:"
echo "   git commit -m 'Initial commit'"
echo ""
echo "2. Push to GitHub:"
echo "   git push -u origin main"
echo ""
echo "3. Enable GitHub Pages:"
echo "   - Go to your repo on GitHub"
echo "   - Settings → Pages"
echo "   - Source: GitHub Actions"
echo ""
echo "After that, every push to main will automatically deploy! 🚀"


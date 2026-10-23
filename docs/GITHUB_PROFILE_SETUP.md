# Setting Up Your Personal GitHub Profile

GitHub provides a special feature that allows you to display a personalized profile page to anyone visiting **`https://github.com/Lokknath`**.

We have created an awesome, modern, animated profile README for you in [`github-profile/README.md`](../github-profile/README.md).

---

## ⚡ 1-Minute Activation Guide

### Method A: Via GitHub Web Interface (Fastest)

1. Go to [https://github.com/new](https://github.com/new).
2. Set the **Repository name** to exactly: **`Lokknath`** (matches your GitHub username).
   - GitHub will show a banner: *"✨ You found a secret! Lokknath/Lokknath is a special repository that you can use to add a README.md to your GitHub profile."*
3. Make sure the repository is marked **Public**.
4. Check **"Add a README file"**.
5. Click **Create repository**.
6. Click the edit (pencil) icon on `README.md`, paste the full contents of [`github-profile/README.md`](../github-profile/README.md), and commit!

---

### Method B: Via Terminal / Git CLI

Run the following commands in your terminal:

```bash
# 1. Create a temporary folder
mkdir -p /tmp/lokknath-profile && cd /tmp/lokknath-profile

# 2. Clone or initialize
git init
git remote add origin https://github.com/Lokknath/Lokknath.git

# 3. Copy the profile README from this project
cp /Users/lokkki/Desktop/ai-terminal-app/github-profile/README.md ./README.md

# 4. Commit and push
git add README.md
git commit -m "feat: Add personalized GitHub developer profile"
git branch -M main
git push -u origin main
```

Once pushed, visit **[https://github.com/Lokknath](https://github.com/Lokknath)** to see your brand-new animated developer profile, live stats cards, and featured project showcase!

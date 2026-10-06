# Contributing to AssetPulse 🤝

First off, thank you for considering contributing to **AssetPulse**! AssetPulse is an open-source personal financial asset tracking platform, and contributions from the community make it better for everyone.

Please take a moment to review this document to ensure a smooth and productive collaboration.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please treat all contributors with respect and professionalism.

---

## Git Hygiene & Branching Model

AssetPulse adheres to strict release engineering branching standards:

- **`main`**: Production-ready branch. Code on `main` is deployable and tagged with releases.
- **`development`**: Integration branch. All features and bugfixes must target this branch first.
- **`feature/<name>`** or **`fix/<name>`**: Create a new branch off `development` for your work.

```bash
# Clone the repository
git clone https://github.com/vaibhavpotdar911/AssetPulse-Financial-Tracker.git
cd AssetPulse-Financial-Tracker

# Check out development branch
git checkout development

# Create your feature branch
git checkout -b feature/my-new-feature
```

---

## Local Development Setup

### Prerequisites
- **Node.js**: `v20.x` or higher
- **NPM**: `v9.x` or higher
- **Git**

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
*(By default, `.env` runs zero-config embedded SQLite `fintrack.db`.)*

### 3. Initialize & Seed Database
```bash
npm run db:prep
npm run db:push
npm run db:seed
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) (or specified port).

---

## Testing & Quality Gates

Every pull request must pass the automated test suite and lint checks:

```bash
# Run the complete test suite (Unit, Integration, E2E)
npm run test

# Run code style & lint checks
npm run lint

# Verify clean production build
npm run build
```

---

## Pull Request Guidelines

1. **Keep PRs Focused**: Avoid bundling multiple unrelated features or refactors in a single PR.
2. **Add Tests**: If you are adding a new feature or calculation, include corresponding unit/integration tests in the `tests/` directory.
3. **Target `development`**: Ensure your PR points to the `development` branch, not `main`.
4. **Update Documentation**: Update the `README.md` if your change introduces new configuration options, environment variables, or workflows.

---

## Security Vulnerabilities

Please do not file public GitHub issues for security vulnerabilities. Instead, refer to our [Security Policy](SECURITY.md) to report security concerns responsibly.

---

Thank you for contributing to open-source personal finance! 💚

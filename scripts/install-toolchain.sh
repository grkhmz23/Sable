#!/bin/bash
# Solana + Anchor Toolchain Installer
# Idempotent installation script for MagicBlock-compatible toolchain
# Rust: 1.85.0 | Solana: 2.3.13 | Anchor: 0.32.1 | Node: 24.10.0

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Version pins
RUST_VERSION="1.85.0"
SOLANA_VERSION="2.3.13"
ANCHOR_VERSION="0.32.1"
NODE_VERSION="24.10.0"

log_info "Starting Solana+Anchor toolchain installation..."
log_info "Target versions: Rust=${RUST_VERSION}, Solana=${SOLANA_VERSION}, Anchor=${ANCHOR_VERSION}, Node=${NODE_VERSION}"

# ============================================
# Install system dependencies
# ============================================
log_info "Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    libudev-dev \
    clang \
    cmake \
    git \
    curl \
    jq \
    ca-certificates \
    gnupg

log_success "System dependencies installed"

# ============================================
# Install Rust
# ============================================
log_info "Setting up Rust ${RUST_VERSION}..."

if ! command -v rustup &> /dev/null; then
    log_info "Installing rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    log_info "rustup already installed"
    source "$HOME/.cargo/env"
fi

# Install and set default toolchain
if ! rustup toolchain list | grep -q "${RUST_VERSION}"; then
    log_info "Installing Rust ${RUST_VERSION}..."
    rustup toolchain install ${RUST_VERSION}
fi

log_info "Setting Rust ${RUST_VERSION} as default..."
rustup default ${RUST_VERSION}

# Add components
log_info "Adding rustfmt and clippy..."
rustup component add rustfmt clippy --toolchain ${RUST_VERSION}

log_success "Rust ${RUST_VERSION} configured"

# ============================================
# Install Solana/Agave CLI
# ============================================
log_info "Setting up Solana/Agave CLI ${SOLANA_VERSION}..."

SOLANA_INSTALL_DIR="$HOME/.local/share/solana/install"
SOLANA_BIN="$SOLANA_INSTALL_DIR/active_release/bin"

# Check if correct version is installed
install_solana=true
if command -v solana &> /dev/null; then
    CURRENT_SOLANA=$(solana --version | awk '{print $2}' || echo "")
    if [ "$CURRENT_SOLANA" = "$SOLANA_VERSION" ]; then
        log_info "Solana ${SOLANA_VERSION} already installed"
        install_solana=false
    else
        log_warn "Solana ${CURRENT_SOLANA} found, updating to ${SOLANA_VERSION}..."
    fi
fi

if [ "$install_solana" = true ]; then
    log_info "Installing Solana ${SOLANA_VERSION}..."
    export PATH="$SOLANA_BIN:$PATH"
    sh -c "$(curl -sSfL https://release.anza.xyz/v${SOLANA_VERSION}/install)"
fi

log_success "Solana ${SOLANA_VERSION} configured"

# ============================================
# Install AVM and Anchor CLI
# ============================================
log_info "Setting up Anchor CLI ${ANCHOR_VERSION}..."

# Ensure cargo bin is in PATH for avm
export PATH="$HOME/.cargo/bin:$PATH"

# Install AVM if not present
if ! command -v avm &> /dev/null; then
    log_info "Installing AVM..."
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
else
    log_info "AVM already installed"
fi

# Ensure AVM bin directory exists
mkdir -p "$HOME/.avm/bin"
export PATH="$HOME/.avm/bin:$PATH"

# Install Anchor version
log_info "Installing Anchor ${ANCHOR_VERSION}..."
avm install ${ANCHOR_VERSION}

# Use the correct Anchor version
log_info "Setting Anchor ${ANCHOR_VERSION} as active..."
avm use ${ANCHOR_VERSION}

log_success "Anchor ${ANCHOR_VERSION} configured"

# ============================================
# Install Node.js via fnm
# ============================================
log_info "Setting up Node.js ${NODE_VERSION}..."

# Install fnm if not present
if ! command -v fnm &> /dev/null; then
    log_info "Installing fnm..."
    export FNM_COREPACK_ENABLED=true
    curl -fsSL https://fnm.vercel.app/install | bash
    
    # Source fnm environment for current shell
    export PATH="$HOME/.local/share/fnm:$PATH"
    eval "$(fnm env)"
else
    log_info "fnm already installed"
    export PATH="$HOME/.local/share/fnm:$PATH"
    eval "$(fnm env)"
fi

# Install Node version
if ! fnm list | grep -q "${NODE_VERSION}"; then
    log_info "Installing Node ${NODE_VERSION}..."
    fnm install ${NODE_VERSION}
else
    log_info "Node ${NODE_VERSION} already installed"
fi

# Set default Node version
log_info "Setting Node ${NODE_VERSION} as default..."
fnm default ${NODE_VERSION}
fnm use ${NODE_VERSION}

# Enable corepack for pnpm
log_info "Enabling corepack and pnpm..."
corepack enable
corepack prepare pnpm@latest --activate

log_success "Node ${NODE_VERSION} and pnpm configured"

# ============================================
# Update ~/.bashrc with PATH exports
# ============================================
log_info "Updating ~/.bashrc with PATH exports..."

# Function to add a line to ~/.bashrc if not already present
add_to_bashrc() {
    local line="$1"
    local comment="${2:-}"
    
    if ! grep -Fxq "$line" ~/.bashrc 2>/dev/null; then
        if [ -n "$comment" ]; then
            echo "" >> ~/.bashrc
            echo "# $comment" >> ~/.bashrc
        fi
        echo "$line" >> ~/.bashrc
    fi
}

# Add PATH exports
add_to_bashrc "export PATH=\"\$HOME/.cargo/bin:\$PATH\"" "Rust/Cargo"
add_to_bashrc "export PATH=\"\$HOME/.avm/bin:\$PATH\"" "Anchor AVM"
add_to_bashrc "export PATH=\"\$HOME/.local/share/solana/install/active_release/bin:\$PATH\"" "Solana CLI"

# Add fnm initialization (check if already present)
if ! grep -q "fnm env" ~/.bashrc 2>/dev/null; then
    echo "" >> ~/.bashrc
    echo "# fnm (Fast Node Manager)" >> ~/.bashrc
    echo 'export PATH="$HOME/.local/share/fnm:$PATH"' >> ~/.bashrc
    echo 'eval "$(fnm env)"' >> ~/.bashrc
fi

# Also ensure fnm is available in this shell for immediate use
export PATH="$HOME/.local/share/fnm:$PATH"
eval "$(fnm env 2>/dev/null || true)"

log_success "~/.bashrc updated"

# ============================================
# Verification
# ============================================
log_info "Verifying installations..."

echo ""
echo "============================================"
echo "Toolchain Versions:"
echo "============================================"

echo -n "Rust:     "
rustc --version || echo "NOT FOUND"

echo -n "Cargo:    "
cargo --version || echo "NOT FOUND"

echo -n "Solana:   "
solana --version 2>/dev/null || echo "NOT FOUND (restart shell or source ~/.bashrc)"

echo -n "Anchor:   "
anchor --version 2>/dev/null || echo "NOT FOUND (restart shell or source ~/.bashrc)"

echo -n "Node:     "
node --version 2>/dev/null || echo "NOT FOUND (restart shell or source ~/.bashrc)"

echo -n "pnpm:     "
pnpm --version 2>/dev/null || echo "NOT FOUND (restart shell or source ~/.bashrc)"

echo "============================================"
echo ""

log_success "Toolchain installation complete!"
log_info "Please run: source ~/.bashrc"
log_info "Or open a new terminal to use the installed tools."

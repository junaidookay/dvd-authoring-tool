FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js and required DVD authoring tools
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs ffmpeg imagemagick dvdauthor genisoimage mjpegtools \
    fonts-liberation ttf-mscorefonts-installer fontconfig \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Accept MS fonts EULA automatically
RUN echo ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true | debconf-set-selections

# Refresh font cache
RUN fc-cache -f -v

# Set up working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Set environment variables for testing
ENV ENVTEST=true
ENV ENV=dev

CMD ["node", "src/ini/server.js"]

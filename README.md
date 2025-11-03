# DVD Authoring Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-%3E%3D20-blue)](https://docker.com)


A Node.js-based tool for creating DVD-Video ISO files with interactive menus, chapters, and high-quality encoding.

## Features

- DVD-Video ISO creation with interactive menus
- Automatic chapter generation (every 10 minutes)
- PAL/NTSC format support
- Two-pass encoding for optimal quality
- Real-time progress via WebSocket
- Interactive DVD menus with button highlights
- Support for intro videos, audio offsets, and custom volume names

## Prerequisites

- Docker & Docker Compose (recommended for development)
- Or: Node.js 18+, FFmpeg, ImageMagick, dvdauthor, genisoimage

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/dvd-authoring-tool.git
   cd dvd-authoring-tool
   ```

2. **Start the development container**
   ```bash
   docker-compose up -d
   ```

3. **Prepare media files**
   Place your input files in the `media/` directory:
   - Video file (MP4, MOV, etc.)
   - Audio file (MP3, WAV, etc.)
   - Still image for menu background (JPG, PNG)
   - Optional: Intro video

4. **Run the authoring tool**
   ```bash
   docker exec -it dvd-author bash
   node /app/src/core/author.js \
     --video /media/your-video.mp4 \
     --audio /media/your-audio.mp3 \
     --still /media/your-image.jpg \
     --output /output/dvd.iso \
     --scratch /scratch
   ```

5. **Check the output**
   Your DVD ISO will be in the `output/` directory.

## Project Structure

```
/
├── src/                  # Source code
│   └── core/
│       └── author.js     # Main DVD authoring script
├── media/                # Input media files (ignored by git)
├── output/               # Generated DVD ISOs (ignored by git)
├── scratch/              # Temporary DVD structure files (ignored by git)
├── examples/             # Usage examples
├── .vscode/              # VS Code configuration
├── package.json          # Node.js dependencies
├── Dockerfile            # Container definition
├── docker-compose.yaml   # Container orchestration
└── docker-compose-remote.yaml.example  # Remote deployment example
```

## Command Line Options

| Option          | Description                          | Required |
|-----------------|--------------------------------------|----------|
| `--video`       | Path to input video file             | Yes      |
| `--audio`       | Path to input audio file             | Yes      |
| `--still`       | Path to still image for menu         | Yes      |
| `--output`      | Path for output ISO file             | Yes      |
| `--scratch`     | Path for temporary files             | Yes      |
| `--intro`       | Path to intro video (optional)       | No       |
| `--format`      | PAL or NTSC (default: PAL)           | No       |
| `--volumeName`  | DVD volume name (default: DVD_VIDEO) | No       |
| `--audioOffset` | Audio offset in seconds (optional)   | No       |
| `--twoPass`     | Enable two-pass encoding             | No       |
| `--debug`       | Enable debug logging                 | No       |

### Example Commands

Basic usage:
```bash
node /app/src/core/author.js \
  --video /media/sample.mp4 \
  --audio /media/sample.wav \
  --still /media/sample.jpg \
  --output /output/sample.iso \
  --scratch /scratch
```

With intro and NTSC:
```bash
node /app/src/core/author.js \
  --video /media/concert.mp4 \
  --audio /media/soundtrack.mp3 \
  --still /media/cover.jpg \
  --intro /media/intro.mp4 \
  --format ntsc \
  --volumeName CONCERT_DVD \
  --twoPass \
  --output /output/concert-dvd.iso \
  --scratch /scratch
```

## API Usage

You can also use this tool programmatically:

```javascript
const { authorDVD } = require('./src/core/author.js');

const options = {
  video: '/path/to/video.mp4',
  audio: '/path/to/audio.wav',
  still: '/path/to/image.jpg',
  output: '/path/to/output.iso',
  scratch: '/path/to/scratch',
  format: 'pal',
  volumeName: 'MY_DVD'
};

authorDVD(options)
  .then(() => console.log('DVD created successfully'))
  .catch(err => console.error('Error:', err));
```

## Architecture

The tool uses a task-based system:
- **Encoding**: FFmpeg for video/audio processing
- **Menu Creation**: ImageMagick for graphics, dvdauthor for DVD structure
- **ISO Generation**: genisoimage for final ISO
- **Progress Tracking**: WebSocket for real-time updates

## Development Workflow

1. Edit code in VS Code (changes sync to container)
2. Run scripts in the container: `docker exec -it dvd-author bash`
3. Debug with `--inspect=0.0.0.0:9229` and VS Code debugger

### Container Management

- Start: `docker-compose up -d`
- Stop: `docker-compose down`
- Rebuild: `docker-compose build`
- Logs: `docker-compose logs`
- Shell: `docker exec -it dvd-author bash`

## Deployment

For remote deployment:

1. **Build and Save the Docker Image**:
   ```bash
   npm run build-docker
   npm run save-image
   ```

2. **Transfer the Image**:
   Use SCP or similar to copy `dvd-author.tar` to your remote server.

3. **Load and Run on Remote Server**:
   - Load the image: `docker load -i dvd-author.tar`
   - Copy `docker-compose-remote.yaml.example` to your server and customize paths.
   - Start: `docker compose -f docker-compose-remote.yaml up -d`
   - Access shell: `docker exec -it dvd-author bash`

Adapt these steps for your infrastructure (e.g., cloud providers, CI/CD pipelines).

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## Acknowledgments

- Built with FFmpeg, ImageMagick, dvdauthor, and genisoimage
- Inspired by DVD authoring standards

## Project Status

I've been crafting DVDs since 1998, authoring over a thousand discs for high-end Hollywood productions and distinctive indie projects. This tool is the distilled essence of those years; a single-button, single-play automated pipeline built for precision, repeatability, and a healthy dose of nostalgia.

Could it be expanded? Sure. But honestly… what's the point?

This is a passion project born from a love of retro tech and the lost art of DVD authoring. It’s shared here in the hope it sparks curiosity, helps someone tinker, or simply preserves a workflow that once mattered deeply.

There are no promises of ongoing support, bug fixes, or feature updates; life’s short, and time is limited. That said, I’m always happy to collaborate. If you spot issues, have ideas, or want to contribute, open an issue or PR and we’ll see where it goes.

Enjoy experimenting. Long love the disc. 📀
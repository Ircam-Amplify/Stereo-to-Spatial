# Stereo-to-Spatial by IRCAM Amplify

A professional audio processing web application that transforms stereo audio into immersive spatial experiences using IRCAM Amplify's cutting-edge technology.

## Features

- **Advanced Audio Processing**: Transform stereo audio into both binaural and immersive spatial formats using IRCAM Amplify's technology
- **Interactive Visualization**: 
  - Real-time waveform visualization with precise playback controls
  - Synchronized playback between original and processed audio
  - Color-coded waveforms for easy version identification
- **Processing Control**: 
  - Adjustable processing intensity from subtle to maximum effect
  - Seamless switching between original and processed versions
- **Multiple Export Options**: 
  - Binaural version (stereo, optimized for headphones)
  - Immersive version (multi-channel spatial audio)
  - Combined ZIP download with both versions
- **Professional Audio Support**: 
  - Supports WAV, FLAC formats
  - Handles files up to 100MB
  - Maximum duration: 30 minutes
  - Maintains high audio quality throughout processing

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/stereo-to-spatial.git
   cd stereo-to-spatial
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your IRCAM Amplify API credentials from https://www.ircam-amplify.io/

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:5000 in your browser

## Prerequisites

- Node.js 20 or later
- IRCAM Amplify API credentials (Sign up at https://www.ircam-amplify.io/)
- Modern web browser with Web Audio API support

## Technical Stack

### Frontend
- TypeScript with React
- Wavesurfer.js for audio visualization
- Tailwind CSS with shadcn/ui components
- Tanstack Query for API state management
- Real-time audio synchronization and buffering

### Backend
- Express.js server with TypeScript
- IRCAM Amplify API integration
- Efficient file processing pipeline
- Automatic session management and cleanup
- Advanced error handling and logging

## Usage Guide

1. **Upload Audio**
   - Drop your audio file in the upload zone or click to browse
   - Supported formats: WAV, FLAC
   - Maximum file size: 100MB
   - Maximum duration: 30 minutes

2. **Adjust Processing**
   - Use the intensity slider to control the spatial effect
   - Choose from 5 levels: Subtle, Gentle, Medium, Intense, Maximum
   - Preview the original audio using the waveform player

3. **Process Audio**
   - Click "Spatialize my track" to start processing
   - Monitor the progress in real-time
   - Switch between original and processed versions using the toggle
   - Synchronized playback maintains timing when switching

4. **Download Options**
   - Binaural Version: Optimized for headphone listening
   - Immersive Version: Full spatial audio with multiple channels
   - All Files: Download both versions in a ZIP archive

## Technical Details

### Audio Processing
- Real-time waveform visualization using WebAudio API
- Efficient audio buffering and memory management
- Synchronized playback between original and processed versions
- Custom waveform rendering for performance optimization

### File Management
- Automatic cleanup of temporary files
- Session-based file organization
- Efficient ZIP compression for downloads
- Proper MIME type handling

### Error Handling
- Comprehensive error logging
- Graceful fallbacks for failed operations
- User-friendly error messages
- Automatic recovery mechanisms

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Development

This project uses:
- Vite for fast development and building
- TypeScript for type safety
- Tailwind CSS for styling
- shadcn/ui for UI components
- Express.js for the backend server

## Best Practices

- Use headphones for optimal binaural audio preview
- Start with medium intensity and adjust based on your needs
- Allow processing to complete before downloading
- Use high-quality input files for best results
- Ensure stable internet connection during processing

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- IRCAM Amplify for their spatial audio technology
- The open-source community for the tools and libraries used

For more information about IRCAM Amplify and their spatial audio technology, visit [their website](https://www.ircam-amplify.io/).

## Security

Please report any security issues to the maintainers directly instead of opening a public issue.

## Downloading the Project

You can get the project in two ways:

1. **Using Git:**
   ```bash
   git clone https://github.com/yourusername/stereo-to-spatial.git
   cd stereo-to-spatial
   npm install
   ```

2. **Download ZIP:**
   - Visit the GitHub repository
   - Click the "Code" button
   - Select "Download ZIP"
   - Extract the ZIP file
   - Open terminal in the extracted folder
   - Run `npm install`

After downloading, make sure to:
1. Copy `.env.example` to `.env`
2. Get your API credentials from IRCAM Amplify
3. Update the `.env` file with your credentials
4. Run `npm run dev` to start the development server
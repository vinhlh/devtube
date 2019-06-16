import chalk from 'chalk'
import program from 'commander'

import App from './app'

const runApp = async (program: program.Command) => {
  const playlistUrl = program.playlist

  const app = new App()
  await app.init()
  await app.openPlaylist(playlistUrl)
  await app.play()

  app.listen()
}

program
  .option('-p, --playlist <playlist>', 'playlist')
  .parse(process.argv)

runApp(program)

#!/usr/bin/env node

import chalk from 'chalk'
import program from 'commander'

import pkg from '../package.json'
import App from './app'

const runApp = async (playlistUrl: string) => {
  const app = new App()
  await app.init()
  await app.openPlaylist(playlistUrl)
  await app.play()

  app.listen()
}

program
  .version(pkg.version)
  .arguments('devtube <playlist>')
  .action(runApp)
  .parse(process.argv)

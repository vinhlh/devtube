const KEYPRESS_VALUE_CTRL_C = '\u0003'

const listenKeyPress = ({ onPressToggle, onPressNext, onClose }) => {
  const stdin = process.openStdin()

  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')

  stdin.on('data', async key => {
    if (key === KEYPRESS_VALUE_CTRL_C) {
      await onClose()
      process.exit()
    }

    if (['p', 'P'].includes(key)) {
      await onPressToggle()
    }

    if (['n', 'N'].includes(key)) {
      await onPressNext()
    }

    process.stdout.write(key)
  })
}

export default listenKeyPress

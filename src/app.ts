import puppeteer from 'puppeteer'
import chalk from 'chalk'
import ora from 'ora'
import keypress from 'keypress'

declare global {
  interface Window {
    yt: any;
    _lact: any;
  }
}

const LISTEN_INTERVAL = 1000

const NOT_AVAILABLE = 'N/A'

// To block ads
// https://adblockplus.org/filter-cheatsheet
// https://raw.githubusercontent.com/kbinani/adblock-youtube-ads/master/signed.txt
const ADBLOCK_REGEXES = [
  'doubleclick\.net',
  'flashtalking\.com',
  'googleadservices\.com',
  'googlesyndication\.com',
  's0\.2mdn\.net\/ads',
  'www\.google.*\/pagead',
  '/api\/stats',
  'pagead',
  'ptracking',
  // dicovered by me :v
  'get_midroll_info'
]

interface State {
  timeCurrent: string
  timeDuration: string
  title: string
  viewCount: string
  playing: String
}

const defaultState = {
  timeCurrent: NOT_AVAILABLE,
  timeDuration: NOT_AVAILABLE,
  title: NOT_AVAILABLE,
  viewCount: NOT_AVAILABLE,
  playing: 'false'
}

class App {
  private browser?: puppeteer.Browser
  private page?: puppeteer.Page
  private state: State
  private ui?: ora.Ora
  private interval?: any
  private adBlockRegex: RegExp

  constructor() {
    this.adBlockRegex = new RegExp(ADBLOCK_REGEXES.join('|'))
    this.state = defaultState
  }

  async init() {
    this.browser = await this.initBrowser()
    this.page = await this.initPage(this.browser)
    this.initUI()
  }

  async initBrowser() {
    const browser = await puppeteer.launch({
      headless: false,
      ignoreDefaultArgs: ['--mute-audio']
    })

    return browser
  }

  async getAvailablePage(browser: puppeteer.Browser) {
    const pages = await browser.pages()
    if (pages.length) {
      return pages[0]
    }

    return await browser.newPage()
  }

  async initPage(browser: puppeteer.Browser) {
    const page = await this.getAvailablePage(browser)

    await page.setRequestInterception(true)
    page.on('request', this.blockUnwantedResources)

    page.setViewport({
      width: 400,
      height: 600
    })

    return page
  }

  async play() {
    if (!this.page) {
      return
    }

    await this.page.evaluate(() => {
      const playButton = document.querySelector(
        '.ytp-button.ytp-play-button-playlist, .ytp-large-play-button.ytp-button'
      ) as HTMLElement

      if (playButton) {
        playButton.click()
      }
    })
  }

  async openPlaylist(playlistUrl: string) {
    if (!this.page) {
      console.error('We need to intit browser first')
      return
    }

    if (!playlistUrl.startsWith('https://')) {
      await this.searchAndPlayFirstResult(playlistUrl)
      return
    }

    await this.page.goto(playlistUrl)
  }

  async searchAndPlayFirstResult(searchTerm: string) {
    await this.page.goto('https://www.youtube.com/')
    await this.page.evaluate(searchTerm => {
      const $input: any = document.querySelector('input#search')
      if ($input) {
        $input.value = searchTerm
        document.getElementById('search-icon-legacy').click()
      }
    }, searchTerm)

    await this.page.waitForNavigation()
    await this.page.evaluate(() => {
      const $firstResult: any = document.querySelector('.ytd-item-section-renderer a.yt-simple-endpoint')
      if ($firstResult) {
        $firstResult.click()
      }
    })
  }

  async fetchState() {
    if (!this.page) {
      return defaultState
    }

    return await this.page.evaluate(() => {
      const selectTextContent = (el: Element) => el.textContent
      const getValue = (selector: string, fn = selectTextContent) => {
        const $el = document.querySelector(selector)
        if (!$el) {
          return 'N/A'
        }

        return fn($el) || 'N/A'
      }

      const timeCurrent = getValue('.ytp-time-current')
      const timeDuration = getValue('.ytp-time-duration')
      const title = getValue('.ytd-video-primary-info-renderer.title')
      const viewCount = getValue('.yt-view-count-renderer')

      const playing = getValue(
        '.ytp-play-button',
        $el => $el.getAttribute('title') === 'Pause (k)' ? 'true' : 'false'
      )

      const $autoplayIcon: any = document.getElementById('.ytp-upnext-autoplay-icon')
      if ($autoplayIcon) {
        $autoplayIcon.click()
      }

      try {
        // XXX: Try to inject Youtube activity check
        window.yt.util.activity.getTimeSinceActive = () => 0
        window._lact = +new Date()
      } catch {}

      return {
        timeCurrent,
        timeDuration,
        title,
        viewCount,
        playing
      }
    })
  }

  listenBrowserState() {
    this.interval = setInterval(async () => {
      this.state = await this.fetchState()
      this.render()
    }, LISTEN_INTERVAL)
  }

  listenKeyPress() {
    const stdin: any = process.stdin
    keypress(stdin)

    stdin.on('keypress', async (_: any, key: any) => {
      if (!key) {
        return
      }

      if (key.ctrl && key.name === 'c') {
        stdin.pause()
        await this.onClose()
        process.exit()
        return
      }

      if (key.name === 'p') {
        this.onPressToggle()
        return
      }

      if (key.name === 'n') {
        this.onPressNext()
        return
      }
    });

    stdin.setRawMode(true)
    stdin.resume()
  }

  async onPressToggle() {
    if (!this.page) {
      return
    }

    await this.page.evaluate(() => {
      const playButton = document.querySelector(
        '.ytp-play-button'
      ) as HTMLElement

      if (playButton) {
        playButton.click()
      }
    })
  }

  async onPressNext() {
    if (!this.page) {
      return
    }

    await this.page.evaluate(() => {
      const nextButton = document.querySelector(
        '.ytp-next-button'
      ) as HTMLElement

      if (nextButton) {
        nextButton.click()
      }
    })
  }

  async onClose() {
    if (!this.browser) {
      return
    }

    await this.browser.close()
  }

  listen() {
    this.listenBrowserState()
    this.listenKeyPress()
  }

  initUI() {
    this.ui = ora({
      spinner: 'dots',
      text: 'Initializing Devtube player (will take ~ 10 seconds)'
    }).start()
  }

  renderPlayStatus = () => {
    const { playing } = this.state

    return playing === 'true'
      ? chalk`{bgBlue.white  ► Playing }`
      : chalk`{bgRed.white  ❚❚ Paused }`
  }

  render() {
    if (!this.ui) {
      return
    }

    this.ui.text = `
${this.renderPlayStatus()} ${this.renderTimePassed()} ${this.renderTrackTitle()}

${this.renderCredit()}
`
  }

  renderTimePassed = () => {
    const { timeCurrent, timeDuration } = this.state
    return chalk`{blue  ${timeCurrent}}/{yellow ${timeDuration}}`
  }

  renderTrackTitle = () => {
    const { title } = this.state
    return chalk`{green.bold ${title}}`
  }

  renderCredit() {
    return chalk`{gray @ {bold Devtube} by {bold vinhlh}. Press {bold P} to toggle pause/play, {bold N} to next, {bold Ctrl-C to terminate}.}`
  }

  blockUnwantedResources = (request: puppeteer.Request) => {
    const url = request.url()
    if (this.adBlockRegex.test(url)) {
      return request.abort()
    }

    request.continue()
  }
}

export default App

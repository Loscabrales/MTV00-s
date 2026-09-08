(function () {
  var M = { cfg: null, calls: [], vid: null, t: 0, state: -1, vol: 100, muted: false, dur: 240 };
  window.__mock = M;
  function Player(el, cfg) {
    M.cfg = cfg;
    var host = typeof el === 'string' ? document.getElementById(el) : el;
    var f = document.createElement('iframe');
    f.id = 'player';
    f.style.cssText = 'width:100%;height:100%;border:0;display:block';
    f.setAttribute('allow', 'autoplay');
    M.iframe = f;
    M.params = new URLSearchParams(
      Object.keys(cfg.playerVars).map(function (k) { return [k, String(cfg.playerVars[k])]; })
    );
    M.embedHost = cfg.host || 'https://www.youtube.com';
    f.src = M.embedHost + '/embed/?' + M.params.toString();
    host.parentNode.replaceChild(f, host);
    var self = this;
    M.fire = function (s) { M.state = s; cfg.events.onStateChange && cfg.events.onStateChange({ data: s, target: self }); };
    M.err = function (c) { cfg.events.onError && cfg.events.onError({ data: c, target: self }); };
    M.endNow = function () { M.fire(0); };
    setTimeout(function () { cfg.events.onReady && cfg.events.onReady({ target: self }); }, 30);
    setInterval(function () { if (M.state === 1) M.t += 0.25; }, 250);
    this.loadVideoById = function (o) {
      M.calls.push(['load', o.videoId, o.startSeconds]);
      M.vid = o.videoId; M.t = o.startSeconds || 0;
      f.src = M.embedHost + '/embed/' + o.videoId + '?' + M.params.toString();
      setTimeout(function () { M.fire(1); }, 40);
    };
    this.playVideo = function () { M.fire(1); };
    this.pauseVideo = function () { M.fire(2); };
    this.stopVideo = function () { M.fire(-1); M.vid = null; };
    this.seekTo = function (s) { M.calls.push(['seek', s]); M.t = s; };
    this.setVolume = function (v) { M.vol = v; };
    this.getVolume = function () { return M.vol; };
    this.mute = function () { M.muted = true; };
    this.unMute = function () { M.muted = false; };
    this.isMuted = function () { return M.muted; };
    this.getCurrentTime = function () { return M.t; };
    this.getDuration = function () { return M.dur; };
    this.getPlayerState = function () { return M.state; };
  }
  window.YT = { Player: Player, PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();

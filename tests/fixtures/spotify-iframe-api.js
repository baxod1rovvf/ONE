// A stand-in for Spotify's embed iFrame API (open.spotify.com/embed/iframe-api/v1)
// used by the browser tests. It records what the app asks it to do.
(function () {
  const fake = (window.__fakeSpotify = { calls: [], destroyed: false, created: 0 });
  const IFrameAPI = {
    createController(element, options, callback) {
      fake.created += 1;
      const frame = document.createElement("div");
      frame.className = "fake-spotify-embed";
      frame.textContent = "Spotify player";
      element.appendChild(frame);
      const listeners = {};
      const emit = (name, data) => (listeners[name] || []).forEach((fn) => fn({ data }));
      const controller = {
        loadUri(uri) {
          fake.calls.push(["loadUri", uri]);
        },
        play() {
          fake.calls.push(["play"]);
          // Browsers may block play() from outside the iframe; tests can say so.
          if (!window.__fakeSpotifyBlockPlay) emit("playback_update", { isPaused: false, position: 0, duration: 1000 });
        },
        resume() {
          this.play();
        },
        pause() {
          fake.calls.push(["pause"]);
          emit("playback_update", { isPaused: true, position: 0, duration: 1000 });
        },
        togglePlay() {
          fake.calls.push(["togglePlay"]);
        },
        addListener(name, fn) {
          (listeners[name] = listeners[name] || []).push(fn);
        },
        destroy() {
          fake.destroyed = true;
        }
      };
      // The person pressing play inside Spotify's own player.
      fake.userPlay = () => {
        fake.calls.push(["userPlay"]);
        emit("playback_update", { isPaused: false, position: 0, duration: 1000 });
      };
      fake.calls.push(["create", options && options.uri]);
      setTimeout(() => {
        emit("ready", {});
        callback(controller);
      }, 10);
    }
  };
  setTimeout(() => window.onSpotifyIframeApiReady && window.onSpotifyIframeApiReady(IFrameAPI), 10);
})();

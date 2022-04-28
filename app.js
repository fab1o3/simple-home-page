var app = new Vue({
    el: '#app',
    data: {
        password: null,
        isPasswordCorrect: false,
        urlRoot: 'https://graph.microsoft.com/v1.0',
        msalInstance: null,
        token: null,
        selectedTab: 'bookmarks',
        // news
        news: {
            feeds: [],
            parser: null,
            refreshDate: null
        },
        // bookmarks
        bookmarks: [],
        newBookmark: {},
        // radio
        radio: [],
        newRadio: {},
        playing: null,
        // notes
        plain: {},
        encrypted: {},
        // document
        chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
        lookup: new Uint8Array(256),
        url: '',
        file: {},
        // settings
        settings: {
            'lockTimeout': {
                'value': 300,
                'idleTime': 1,
                'label': 'Lock timeout (seconds)',
                'type': 'text'
            },
            'feedUrls': {
                'value': [],
                'label': 'Feeds',
                'type': 'textarea'
            },
            'totalFeeds': {
                'value': 20,
                'label': 'Total feeds',
                'type': 'text'
            },
            'pdfExt': {
                'value': '',
                'label': 'Pdf extension url',
                'type': 'text'
            }
        }
    },
    watch: {
        settings: {
            handler(newValue, oldValue) {
                localStorage.setItem('settings', JSON.stringify(newValue));
            },
            deep: true
        },
        bookmarks: {
            handler(newValue, oldValue) {
                if(isPasswordCorrect) {
                    localStorage.setItem('bookmarks', JSON.stringify(newValue));
                }
            },
            deep: true
        },
        plain: {
            handler(newValue, oldValue) {
                localStorage.setItem('plain', JSON.stringify(newValue));
            },
            deep: true
        },
        encrypted: {
            handler(newValue, oldValue) {
                localStorage.setItem('encrypted', sjcl.encrypt(this.password, JSON.stringify(newValue)));
            },
            deep: true
        }
    },
    computed: {
        sortedBookmarks: function () {
            function compare(a, b) {
                [a, b].forEach(function (obj) {
                    ['category', 'name', 'url'].forEach(item => {
                        if (obj[item] === undefined) {
                            obj[item] = '';
                        }
                    });
                });
                return a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.url.localeCompare(b.url);
            }

            return this.bookmarks.sort(compare);
        },
        sortedRadios: function () {
            return this.radio.sort(this.compare);
        }
    },
    mounted: function () {
        this.login();

        let self = this;

        // Use a lookup table to find the index.
        for (var i = 0; i < this.chars.length; i++) {
            this.lookup[this.chars.charCodeAt(i)] = i;
        }

        this.news.parser = new RSSParser();

        window.addEventListener('click', function (e) {
            if (localStorage.getItem('settings')) {
                self.settings = JSON.parse(localStorage.getItem('settings'));
                self.settings['lockTimeout'].idleTime = 0;
            }
        });
    },
    methods: {
        init: function (is_first) {
            var appObjects = ['settings', 'plain', 'bookmarks', 'radio'];

            appObjects.forEach(function (item, index) {
                if (localStorage.getItem(item)) {
                    app[item] = JSON.parse(localStorage.getItem(item));
                }
            });

            if (localStorage.getItem('encrypted')) {
                this.encrypted = JSON.parse(sjcl.decrypt(this.password, localStorage.getItem('encrypted')));
            }

            if (is_first) {
                this.refreshFeeds();
                setInterval(this.refreshFeeds, 1800 * 1000);
                setInterval(this.refresh, this.settings['lockTimeout'].value * 1000);
            }
            
        },
        load: function () {
            axios.get(this.urlRoot + '/me/drive/root:/000000004C12B506/settings.txt:/content', {
                headers: {
                    Authorization: 'Bearer ' + this.token
                }
            }).then((response) => {
                let remoteStorage = response.data;
                var keys = Object.keys(remoteStorage);
                keys.forEach(function (key) {
                    localStorage.setItem(key, remoteStorage[key]);
                });
                Swal.fire('Local storage updated');
                this.init();
                this.$forceUpdate();
            }).catch((error) => {
                Swal.fire({icon: 'error', text: JSON.stringify(error)});
            });
        },
        save: function () {
            axios.put(this.urlRoot + '/me/drive/root:/000000004C12B506/settings.txt:/content', localStorage, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: 'Bearer ' + this.token
                }
            }).then(function (response) {
                Swal.fire('Remote storage updated');
            }).catch((error) => {
                if (error.response.status === 401) {
                    this.refreshToken();
                } else {
                    Swal.fire({ icon: 'error', text: JSON.stringify(error) });
                }
            });

        },
        copy: function (text) {
            navigator.clipboard.writeText(text).then(function () {
                Swal.fire('Copying to clipboard was successful!');
            });
        },
        add: function () {
            Swal.fire({
                title: 'Add a field',
                html:
                    '<input id="name" class="swal2-input" placeholder="Name">' +
                    '<input id="label" class="swal2-input" placeholder="Label">' +
                    '<select id="type" class="swal2-input">' +
                    '<option value="text">text</option>' +
                    '<option value="textarea">textarea</option>' +
                    '<option value="password">password</option>' +
                    '<option value="url">url</option>' +
                    '</select>' +
                    '<input type="checkbox" id="is_encrypted">' +
                    '<span class="swal2-label">Encrypted</span>',
                showCancelButton: true,
                focusConfirm: false,
                preConfirm: () => {
                    let e = document.getElementById('type');
                    return [
                        document.getElementById('name').value,
                        document.getElementById('label').value,
                        e.options[e.selectedIndex].value
                    ]
                }
            }).then((result) => {
                if (result.value) {
                    if (result.value[3]) {
                        this.encrypted[result.value[0]] = {};
                        this.encrypted[result.value[0]].label = result.value[1];
                        this.encrypted[result.value[0]].type = result.value[2];
                        localStorage.setItem('encrypted', sjcl.encrypt(this.password, JSON.stringify(this.encrypted)));
                    } else {
                        this.plain[result.value[0]] = {};
                        this.plain[result.value[0]].label = result.value[1];
                        this.plain[result.value[0]].type = result.value[2];
                        localStorage.setItem('plain', JSON.stringify(this.plain));
                    }
                    this.$forceUpdate();
                }
            });
        },
        remove: function (field, is_encrypted) {
            if (is_encrypted) {
                delete this.encrypted[field];
                localStorage.setItem('encrypted', sjcl.encrypt(this.password, JSON.stringify(this.encrypted)));
            } else {
                delete this.plain[field];
                localStorage.setItem('plain', JSON.stringify(this.plain));
            }
            this.$forceUpdate();
        },
        unlock: function (is_first) {
            Swal.fire({
                title: 'Enter your password',
                input: 'password',
                inputPlaceholder: 'Enter your password',
                showCancelButton: false,
                showCloseButton: false,
                allowOutsideClick: false,
                inputValidator: (value) => {
                    if (!value) {
                        return 'Password cannot be empty!'
                    }
                },
                inputAttributes: {
                    maxlength: 10,
                    autocapitalize: 'off',
                    autocorrect: 'off'
                }
            }).then((result) => {
                this.password = result.value;

                if (localStorage.getItem('encrypted')) {
                    try {
                        this.isPasswordCorrect = true;
                        this.init(is_first);
                    } catch {
                        this.isPasswordCorrect = false;
                        Swal.fire({icon: 'error', title: 'Password is not correct!'}).then((result) => {
                            this.unlock(is_first);
                        });
                    }
                } else {
                    this.isPasswordCorrect = true;
                    this.init(is_first);
                }
            });
        },
        login: function () {
            const msalConfig = {
                auth: {
                    clientId: '78036dbf-d50f-43d7-92b0-6d902450c5d0'
                }
            };

            this.msalInstance = new msal.PublicClientApplication(msalConfig);

            const request = {
                scopes: ["Files.Read.All", "Files.ReadWrite", "Mail.Read", "User.Read"],
                redirectUri: window.location.href
            };

            /*this.msalInstance.loginPopup(request).then(response => {
                this.token = response.accessToken;
                this.unlock(true);
            }).catch(error => {
                Swal.fire({icon: 'error', text: JSON.stringify(error)});
            });*/
            
            this.msalInstance.loginRedirect(request);
            this.msalInstance.handleRedirectPromise().then((tokenResponse) => {
                this.token = tokenResponse.accessToken;
                this.unlock(true);
            }).catch((error) => {
                Swal.fire({icon: 'error', text: JSON.stringify(error)});
            });

        },
        refreshToken: function() {
             let request = {
                scopes: ["Files.Read.All", "Files.ReadWrite", "Mail.Read", "User.Read"],
                redirectUri: window.location.href
            };

            this.msalInstance.acquireTokenSilent(request).then(response => {
                this.token = response.accessToken;
            }).catch(error => {
                this.msalInstance.acquireTokenPopup(request).then(response => {
                    this.token = response.accessToken;
                }).catch(error => {
                    Swal.fire({ icon: 'error', text: JSON.stringify(error) });
                });
            });
        },
        isActive: function (name) {
            if (this.selectedTab === name) {
                return 'is-active';
            }
        },
        refresh: function () {
            if (this.settings['lockTimeout'].idleTime) {
                // location.reload();
                this.unlock();
            }
            this.settings['lockTimeout'].idleTime = 1;
        },
        addBookmark: function () {
            this.bookmarks.push(Object.assign({}, this.newBookmark));
            localStorage.setItem("bookmarks", JSON.stringify(this.bookmarks));
        },
        deleteBookmark: function (index) {
            this.bookmarks.splice(index, 1);
            localStorage.setItem("bookmarks", JSON.stringify(this.bookmarks));
        },
        addRadio: function () {
            this.radio.push(Object.assign({}, this.newRadio));
            localStorage.setItem("radio", JSON.stringify(this.radio));
        },
        deleteRadio: function (index) {
            this.radio.splice(index, 1);
            localStorage.setItem("radio", JSON.stringify(this.radio));
        },
        playRadio: function (index) {
            if (this.playing) {
                if (this.radio[index].playing) {
                    this.playing.stop();
                } else {
                    return;
                }
            }
            this.playing = new Howl({
                src: [this.radio[index].url],
                html5: true
            });

            this.playing.play();
            this.radio[index].playing = true;
            this.$forceUpdate();
        },
        stopRadio: function (index) {
            this.playing.stop();
            this.playing.unload();
            this.playing = null;
            this.radio[index].playing = false;
            this.$forceUpdate();
        },
        compare: function (a, b) {
            [a, b].forEach(function (obj) {
                ['category', 'name', 'url'].forEach(item => {
                    if (obj[item] === undefined) {
                        obj[item] = '';
                    }
                });
            });
            return a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.url.localeCompare(b.url);
        },
        encode: function (arraybuffer) {
            var bytes = new Uint8Array(arraybuffer),
                i, len = bytes.length, base64 = "";

            for (i = 0; i < len; i += 3) {
                base64 += this.chars[bytes[i] >> 2];
                base64 += this.chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
                base64 += this.chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
                base64 += this.chars[bytes[i + 2] & 63];
            }

            if ((len % 3) === 2) {
                base64 = base64.substring(0, base64.length - 1) + "=";
            } else if (len % 3 === 1) {
                base64 = base64.substring(0, base64.length - 2) + "==";
            }

            return base64;
        },
        decode: function (base64) {
            var bufferLength = base64.length * 0.75,
                len = base64.length, i, p = 0,
                encoded1, encoded2, encoded3, encoded4;

            if (base64[base64.length - 1] === "=") {
                bufferLength--;
                if (base64[base64.length - 2] === "=") {
                    bufferLength--;
                }
            }

            var arraybuffer = new ArrayBuffer(bufferLength),
                bytes = new Uint8Array(arraybuffer);

            for (i = 0; i < len; i += 4) {
                encoded1 = this.lookup[base64.charCodeAt(i)];
                encoded2 = this.lookup[base64.charCodeAt(i + 1)];
                encoded3 = this.lookup[base64.charCodeAt(i + 2)];
                encoded4 = this.lookup[base64.charCodeAt(i + 3)];

                bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
                bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
                bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
            }

            return arraybuffer;
        },
        processFile(event) {
            let reader = new FileReader();
            reader.onload = (e) => {
                this.file.name = event.target.files[0].name;
                this.file.type = event.target.files[0].type;
                this.file.content = this.encode(e.target.result);
            }
            reader.readAsArrayBuffer(event.target.files[0]);
        },
        saveDocument: function () {
            let encrypted = sjcl.encrypt(this.password, JSON.stringify(this.file));
            axios.put(this.urlRoot + '/me/drive/root:/000000004C12B506/document.txt:/content', encrypted, {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    Authorization: 'Bearer ' + this.token
                }
            }).then((response) => {
                Swal.fire('Document saved!');
            }).catch((error) => {
                Swal.fire({icon: 'error', text: JSON.stringify(error)});
            });
        },
        viewDocument: function () {
            axios.get(this.urlRoot + '/me/drive/root:/000000004C12B506/document.txt:/content', {
                headers: {
                    Authorization: 'Bearer ' + this.token
                },
            }).then((response) => {
                this.message = null;
                let decrypted = JSON.parse(sjcl.decrypt(this.password, JSON.stringify(response.data)));

                switch (decrypted.type) {
                    case 'application/pdf':
                        let pdfURL = window.URL.createObjectURL(new Blob([this.decode(decrypted.content)], {
                            type: decrypted.type
                        }));
                        if (this.settings['pdfExt'].value) {
                            pdfURL = this.settings['pdfExt'].value + pdfURL;
                            window.open(pdfURL);
                        } else {
                            this.url = pdfURL;
                        }
                        break;
                    default:
                        let link = document.createElement('a');
                        link.download = decrypted.name;
                        link.target = '_blank';
                        link.href = window.URL.createObjectURL(new Blob([this.decode(decrypted.content)], {
                            type: decrypted.type
                        }));
                        link.click();
                        break;
                }
            }).catch((error) => {
                if (error.response.status === 401) {
                    this.refreshToken();
                } else {
                    Swal.fire({ icon: 'error', text: JSON.stringify(error) });
                }
            });
        },
        addZero: function (i) {
            if (i < 10) {
                i = "0" + i;
            }
            return i;
        },
        formatDate: function (date) {
            if (!date) {
                return;
            }
            if (typeof date === 'string') {
                date = new Date(date);
            }
            return date.getDate() + '/' + (date.getMonth() + 1) + '/' + date.getFullYear() + ' ' + this.addZero(date.getHours()) + ':' + this.addZero(date.getMinutes()) + ' ';
        },
        formatDescription: function (description) {
            let regex = /(<([^>]+)>)/ig;
            description = description.replace(regex, '').trim();
            let txt = document.createElement('textarea');
            txt.innerHTML = description;
            description = txt.value;
            return (description.length > 256) ? description.substr(0, 255) + '...' : description;
        },
        refreshFeeds: function () {
            let feedUrls = JSON.parse(this.settings.feedUrls.value);
            let singleFeed = Math.round(this.settings.totalFeeds.value / feedUrls.length);
            this.news.feeds = [];
            this.news.refreshDate = new Date();
            feedUrls.forEach((url) => {
                this.news.parser.parseURL(url, (err, feed) => {
                    if (err) {
                        throw err;
                    }

                    if (feed.items) {
                        feed.items.forEach((value, key) => {
                            value.content = this.formatDescription(value.content);
                            if (key > singleFeed) {
                                return false;
                            }
                            this.news.feeds.push(value);
                        });

                        this.news.feeds.sort(function (a, b) {
                            // Turn your strings into dates, and then subtract them
                            // to get a value that is either negative, positive, or zero.
                            return new Date(b.pubDate) - new Date(a.pubDate);
                        });
                    }
                });
            });
        },
    }
});

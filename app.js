var app = new Vue({
    el: '#app',
    data: {
        password: null,
        storageUser: null,
        storagePassword: null,
        isPasswordCorrect: false,
        selectedTab: 'news',
        bookmarks: [],
        newBookmark: {},
        radio: [],
        newRadio: {},
        playing: null,
        settings: {
            'jsonStorage': {
                'value': null,
                'label': 'JSON Storage URL',
                'type': 'url'
            },
            'lockTimeout': {
                'value': 300,
                'idleTime': 1,
                'label': 'Lock timeout (seconds)',
                'type': 'text'
            }
        },
        plain: {},
        encrypted: {}
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
                localStorage.setItem('bookmarks', JSON.stringify(newValue));
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
        }
    },
    mounted: function () {
        this.unlock();

        let self = this;

        window.addEventListener('click', function (e) {
            self.settings['lockTimeout'].idleTime = 0;
        });

        setInterval(this.refresh, this.settings['lockTimeout'].value * 1000);
    },
    methods: {
        init: function () {
            var appObjects = ['settings', 'plain', 'bookmarks', 'radio'];

            appObjects.forEach(function (item, index) {
                if (localStorage.getItem(item)) {
                    app[item] = JSON.parse(localStorage.getItem(item));
                }
            });

            if (localStorage.getItem('encrypted')) {
                this.encrypted = JSON.parse(sjcl.decrypt(this.password, localStorage.getItem('encrypted')));
            }
        },
        load: function () {
            axios.get(this.settings['jsonStorage'].value, {
                auth: {
                    username: this.storageUser,
                    password: this.storagePassword
                },
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
                Swal.fire({
                    icon: 'error',
                    text: JSON.stringify(error)
                });
            });
        },
        save: function () {
            if (this.settings['jsonStorage'].value) {
                axios.put(this.settings['jsonStorage'].value, localStorage, {
                    auth: {
                        username: this.storageUser,
                        password: this.storagePassword
                    },
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }).then(function (response) {
                    Swal.fire('Remote storage updated');
                }).catch((error) => {
                    Swal.fire({
                        icon: 'error',
                        text: JSON.stringify(error)
                    });
                });
            }
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
        unlock: function () {
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
                        this.init();
                    } catch {
                        this.isPasswordCorrect = false;
                        Swal.fire({
                            icon: 'error',
                            title: 'Password is not correct!'
                        }).then((result) => {
                            this.unlock();
                        });
                    }
                } else {
                    this.isPasswordCorrect = true;
                    this.init();
                }
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
        }
    }
});


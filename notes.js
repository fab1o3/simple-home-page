var app = new Vue({
        el: '#app',
        data: {
            password: null,
            isPasswordCorrect: false,
            plain: {
                'jsonStorage': {
                    'value': null,
                    'label': 'JSON Storage URL',
                    'type': 'url'
                }
            },
            encrypted: {}
        },
        mounted: function () {
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
                        this.encrypted = JSON.parse(sjcl.decrypt(this.password, localStorage.getItem('encrypted')));
                        this.isPasswordCorrect = true;
                        this.init();
                    } catch {
                        this.isPasswordCorrect = false;
                        console.log('Password is wrong!');
                    }
                } else {
                    this.isPasswordCorrect = true;
                    this.init();
                }
            });
        },
        methods: {
            init: function () {
                Object.keys(this.plain).forEach(element => {
                    this.plain[element].value = localStorage.getItem(element);
                });
            },
            load: function () {
                axios.get(this.plain['jsonStorage'].value).then((response) => {
                    let remoteStorage = response.data;
                    var keys = Object.keys(remoteStorage);
                    keys.forEach(function (key) {
                        localStorage.setItem(key, remoteStorage[key]);
                    });
                    Swal.fire('Local storage updated');
                });
            },
            save: function () {
                Object.keys(this.plain).forEach(element => {
                    localStorage.setItem(element, this.plain[element].value);
                });

                localStorage.setItem('encrypted', sjcl.encrypt(this.password, JSON.stringify(this.encrypted)));

                axios.put(this.plain['jsonStorage'].value, localStorage).then(function (response) {
                    Swal.fire('Remote storage updated');
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
                    '<option value="url">url</option>' +
                    '<option value="textarea">textarea</option>' +
                    '<option value="password">password</option>' +
                    '<option value="link">link</option>' +
                    '</select>',
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
                        this.encrypted[result.value[0]] = {};
                        this.encrypted[result.value[0]].label = result.value[1];
                        this.encrypted[result.value[0]].type = result.value[2];
                        this.$forceUpdate();
                    }
                });
            },
            remove: function (field) {
                delete this.encrypted[field];
                this.$forceUpdate();
            }
        }
    });

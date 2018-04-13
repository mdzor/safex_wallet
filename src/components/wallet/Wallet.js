import React from 'react';
import axios from 'axios';

var fileDownload = require('react-file-download');
var fs = window.require('fs');
var os = window.require('os');
var bs58 = require('bs58');
var bitcoin = require('bitcoinjs-lib');
var bitcore = window.require('bitcore-lib');
import {toHexString, encrypt, safexPayload, decrypt} from '../../utils/utils';
import {genkey} from '../../utils/keys';
import QRCode from 'qrcode.react';
import NumberFormat from 'react-number-format';


import Navigation from '../Navigation';


export default class Wallet extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            //wallet state
            keys: [],
            wallet: {},
            import_key: '',
            archive_active: false,

            //transaction
            send_coin: 'safex',
            send_amount: 1,
            send_fee: 0.0001,
            send_total: 1,
            send_overflow_active: false,
            history_overflow_active: false,
            history_key: '',
            send_to: '',
            send_keys: {
                public_key: '',
                private_key: ''
            },
            transaction_being_sent: false,
            transaction_sent: false,
            txid: "",
            average_fee: 0,
            active_fee: 'fast',
            safex_price: 0,
            btc_price: 0,

            //UI state
            btc_sync: false,
            safex_sync: false,
            is_loading: false,
            receive_amount: 0.00000001.toFixed(8),
            collapse_open: {
                key: '',
                receive_open: false,
                send_open: false
            },
            settings_active: false,
            refreshTimer: 0,
            refreshInterval: '',
            status_text: 'Loading...'
        }

        this.createKey = this.createKey.bind(this);
        this.importKey = this.importKey.bind(this);
        this.importKeyChange = this.importKeyChange.bind(this);
        this.sendCoins = this.sendCoins.bind(this);
        this.prepareDisplay = this.prepareDisplay.bind(this);
        this.prepareDisplayPendingTx = this.prepareDisplayPendingTx.bind(this);
        this.openCoinModal = this.openCoinModal.bind(this);
        this.closeCoinModal = this.closeCoinModal.bind(this);
        this.openHistoryModal = this.openHistoryModal.bind(this);
        this.closeHistoryModal = this.closeHistoryModal.bind(this);
        this.sendAmountOnChange = this.sendAmountOnChange.bind(this);
        this.sendFeeOnChange = this.sendFeeOnChange.bind(this);
        this.sendFeeOnBlur = this.sendFeeOnBlur.bind(this);
        this.sendTotalAdjustCoinChange = this.sendTotalAdjustCoinChange.bind(this);
        this.closeSuccessModal = this.closeSuccessModal.bind(this);

        this.exportUnencryptedWallet = this.exportUnencryptedWallet.bind(this);
        this.exportEncryptedWallet = this.exportEncryptedWallet.bind(this);
        this.getFee = this.getFee.bind(this);
        this.refreshWallet = this.refreshWallet.bind(this);
        this.feeChange = this.feeChange.bind(this);
        this.openSettingsModal = this.openSettingsModal.bind(this);
        this.closeSettingsModal = this.closeSettingsModal.bind(this);
        this.changePassword = this.changePassword.bind(this);
        this.logout = this.logout.bind(this);
        this.listTransactions = this.listTransactions.bind(this);
        this.sendToArchive = this.sendToArchive.bind(this);
        this.setArchiveView = this.setArchiveView.bind(this);
        this.setHomeView = this.setHomeView.bind(this);
        this.removeFromArchive = this.removeFromArchive.bind(this);
    }

    logout() {
        localStorage.clear();
        this.context.router.push('/');
    }


    refreshWallet() {
        if (this.state.refreshTimer === 0) {
            this.prepareDisplay();
            let interval = setInterval(this.refreshWalletTimer, 1000);
            this.setState({
                refreshTimer: 23,
                refreshInterval: interval,
            });
            this.prepareDisplayPendingTx()
        }
    }

    refreshWalletTimer = () => {
        if (this.state.refreshTimer > 0) {
            this.setState({refreshTimer: this.state.refreshTimer - 1});
        }
        else {
            clearInterval(this.state.refreshInterval);
        }
    }

    componentWillMount() {
        try {
            var json = JSON.parse(localStorage.getItem('wallet'));
            this.setState({wallet: json, keys: json['keys']});
        } catch (e) {
            alert('failed to parse wallet')
            this.context.router.push('/');
        }
    }

    componentDidMount() {
        this.refreshWallet();
        this.getFee();
    }

    componentWillUnmount() {
        clearInterval(this.timerID);
    }


    getFee() {
        fetch('http://omni.safex.io:3001/getfee')
            .then(resp => resp.text())
            .then((resp) => {
                this.setState({average_fee: resp, send_fee: resp});
            })
            .catch(e => {
                alert('unable to fetch average fee')
                this.setState({
                    btc_sync: false,
                    safex_sync: false,
                    status_text: 'Synchronization error, try refreshing later'
                });
            });
    }

    prepareDisplayPendingTx(keys = null) {
        var promises = [];
        if (keys === null) {
            keys = this.state.keys.filter(function(item) {
                return (item.archived == false || !item.hasOwnProperty("archived"))
            })
        }

        if (!Array.isArray(keys)) {
            keys = [keys]
        }

        keys.forEach((key) => {
            var json = {};
            json['address'] = key.public_key;
            promises.push(fetch('http://omni.safex.io:3001/unconfirmed', {
                method: "POST",
                body: JSON.stringify(json)
            })
                .then(resp => resp.json())
                .then((resp) => {
                    return resp
            }));
        });

        Promise.all(promises).then(values => {
            var iteration = 0;
            for (var x = 0; x < values.length; x++) {
                var currentIndex = this.state.keys.findIndex(i => i.public_key === keys[iteration]['public_key']);
                this.state.keys[currentIndex].pending_safex_bal = values[iteration]
                iteration += 1;
            }
        });
    }

    prepareDisplay(keys = null) {
        var promises = [];
        if (keys === null) {
            keys = this.state.keys.filter(function(item) {
                return (item.archived == false || !item.hasOwnProperty("archived"))
            })
        }

        if (!Array.isArray(keys)) {
            keys = [keys]
        }

        keys.forEach((key) => {
            var json = {};
            json['address'] = key.public_key;
            promises.push(fetch('http://omni.safex.io:3001/balance', {
                method: "POST",
                body: JSON.stringify(json)
            })
                .then(resp => resp.json())
                .then((resp) => {
                    return resp
                }));
            promises.push(fetch('http://bitcoin.safex.io:3001/insight-api/addr/' + key.public_key + '/balance')
                .then(resp => resp.text())
                .then((resp) => {
                    return resp
                }));
            promises.push(fetch('http://bitcoin.safex.io:3001/insight-api/addr/' + key.public_key + '/unconfirmedBalance')
                .then(resp => resp.text())
                .then((resp) => {
                    return resp
                }));
        });
        Promise.all(promises).then(values => {
            var internal_index = 0;
            var iteration = 0;
            for (var x = 0; x < values.length; x++) {
                var currentIndex = this.state.keys.findIndex(i => i.public_key === keys[internal_index]['public_key']);
                if (iteration === 0) {
                    this.state.keys[currentIndex].safex_bal = values[x].balance;
                    iteration += 1;
                } else if (iteration === 1) {
                    this.state.keys[currentIndex].btc_bal = (values[x] / 100000000).toFixed(8);
                    iteration += 1;
                } else if (iteration === 2) {
                    this.state.keys[currentIndex].pending_btc_bal = (values[x] / 100000000).toFixed(8);
                    iteration = 0;
                    internal_index += 1;
                }
            }
            this.setState({
                keys: this.state.keys,
                btc_sync: true,
                safex_sync: true,
                status_text: 'Synchronized',
                safex_price: localStorage.getItem('safex_price'),
                btc_price: localStorage.getItem('btc_price'),
            });
        }).catch(e => {
            console.log(e)
            this.setState({
                btc_sync: false,
                safex_sync: false,
                status_text: 'Synchronization error, try refreshing later'
            });
        });
    }


    sendCoins(e) {
        e.preventDefault();
        //check whether Bitcoin or Safex is selected
        if (this.state.send_coin === 'safex') {
            //open the modal by setting transaction_being_sent
            try {
                this.setState({
                    transaction_being_sent: true,
                });

                //set the signing key for the transaction
                var keys = bitcoin.ECPair.fromWIF(e.target.private_key.value);
                //set the source of the transaction
                var source = e.target.public_key.value;
                //set the amount provided by the user
                var amount = e.target.amount.value;
                //set the fee provided by the user
                var fee = e.target.fee.value;
                //set the destination provided by the user
                var destination = e.target.destination.value;

                //here we will check to make sure that the destination is a valid bitcoin address

                var address = bitcore.Address.fromString(destination);
                var address2 = bitcore.Address.fromString(source);
                //here we try to get the unspent transactions from the source we send from
                try {
                    fetch('http://bitcoin.safex.io:3001/insight-api/addr/' + e.target.public_key.value + '/utxo')
                        .then(resp => resp.json())
                        .then((resp) => {
                            //enter into the safex transaction method
                            this.formSafexTransaction(resp,
                                amount,
                                parseFloat((fee * 100000000).toFixed(0)),
                                destination,
                                keys,
                                source);
                        });
                } catch (e) {
                    //if the fetch fails then we have a network problem and can't get unspent transaction history
                    alert('network communication error, please try again later');
                    this.setState({
                        transaction_being_sent: false,
                    });
                }
            } catch (e) {
                //this is triggered if the destination address is not a valid bitcoin address
                alert('invalid destination address');
            }

            //if safex is not selected then it must be Bitcoin
        } else {
            try {  //open the modal by setting transaction_being_sent
                this.setState({
                    transaction_being_sent: true,
                });

                //set the signing key for the transaction
                var keys = bitcoin.ECPair.fromWIF(e.target.private_key.value);
                //set the source of the transaction
                var source = e.target.public_key.value;
                //set the amount provided by the user
                var amount = e.target.amount.value;
                //set the fee provided by the user
                var fee = e.target.fee.value;
                //set the destination provided by the user
                var destination = e.target.destination.value;

                //here we will check to make sure that the destination is a valid bitcoin address

                var address = bitcore.Address.fromString(destination);
                var address2 = bitcore.Address.fromString(source);
                //here we try to get the unspent transactions from the source we send from
                try {
                    fetch('http://bitcoin.safex.io:3001/insight-api/addr/' + e.target.public_key.value + '/utxo')
                        .then(resp => resp.json())
                        .then((resp) => {
                            //enter into the bitcoin transaction method
                            this.formBitcoinTransaction(resp,
                                parseFloat((amount * 100000000).toFixed(0)),
                                parseFloat((fee * 100000000).toFixed(0)),
                                destination,
                                keys,
                                source);
                        });
                } catch (e) {
                    //if the fetch fails then we have a network problem and can't get unspent transaction history
                    alert('network communication error, please try again later');
                    this.setState({
                        transaction_being_sent: false,
                    });
                }
            } catch (e) {
                //this is triggered if the destination address is not a valid bitcoin address
                alert('invalid destination address');
            }
        }
    }

    formBitcoinTransaction(utxos, amount, fee, destination, key, source) {
        var running_total = 0;
        var tx = new bitcoin.TransactionBuilder();
        var inputs_num = 0;
        utxos.forEach(txn => {

            if (!txn.confirmations > 0) {

            } else {

                if (running_total < (amount + fee)) {
                    running_total += txn.satoshis;
                    tx.addInput(txn.txid, txn.vout);
                    inputs_num += 1;
                }
            }
        });
        tx.addOutput(destination, amount);

        if ((running_total - (amount + fee)) > 0) {
            tx.addOutput(source, (running_total - (amount + fee)));
        }
        for (var i = 0; i < inputs_num; i++) {
            tx.sign(i, key);
        }

        var json = {};
        json['rawtx'] = tx.build().toHex();
        fetch('http://omni.safex.io:3001/broadcast', {method: "POST", body: JSON.stringify(json)})
            .then(resp => resp.text())
            .then((resp) => {
                this.setState({
                    transaction_sent: true,
                    transaction_being_sent: false,
                    txid: resp
                });
            });
    }


    formSafexTransaction(utxos, amount, fee, destination, key, source) {
        var running_total = 0;
        var tx = new bitcoin.TransactionBuilder();
        var inputs_num = 0;
        var check = 0;
        var checks = [source, destination];

        utxos.forEach(txn => {

            if (running_total < (100 + fee)) {
                running_total += txn.satoshis;
                tx.addInput(txn.txid, txn.vout);
                inputs_num += 1;
            }
        });
        tx.addOutput(destination, 2730);

        if ((running_total - (2730 + fee)) > 0) {
            tx.addOutput(source, (running_total - (2730 + fee)));
        } else {
            check++; // no need check for source
            checks = [destination];
        }

        var SafexTransaction = {};
        SafexTransaction['incomplete_tx'] = tx.buildIncomplete().toHex();
        SafexTransaction['amount'] = amount;
        fetch('http://omni.safex.io:3001/getsafextxn', {method: "POST", body: JSON.stringify(SafexTransaction)})
            .then(resp => resp.text())
            .then((resp) => {
                var decoded_txn = bitcoin.Transaction.fromHex(resp);
                var txn = bitcoin.TransactionBuilder.fromTransaction(decoded_txn);
                checks.forEach(function(item) {
                    txn.tx.outs.some(out => {
                        try {
                            var pubkey = bitcoin.address.fromOutputScript(out.script, bitcoin.networks.livenet);
                        } catch (e) {
                            console.log(e);
                        }
                        if (pubkey === item) {
                            check += 1;
                            return;
                        }
                    });
                });

                if (check === 2) {
                    for (var i = 0; i < inputs_num; i++) {
                        txn.sign(i, key);
                    }
                    var json = {};
                    json['rawtx'] = txn.build().toHex();
                    fetch('http://omni.safex.io:3001/broadcast', {method: "POST", body: JSON.stringify(json)})
                        .then(resp => resp.text())
                        .then((resp) => {
                            this.setState({
                                transaction_sent: true,
                                transaction_being_sent: false,
                                txid: resp
                            });
                        })
                } else {
                    alert("error with transaction")
                }
            });
    }

    //TODO: needs more testing - safex not sent
    formSafexTransactionBeta(utxos, amount, fee, destination, key, source) {
        var running_total = 0;
        var tx = new bitcoin.TransactionBuilder();
        var inputs_num = 0;

        // here we list btc tx from our wallet, remove 700sats, put back (the rest - fee) to ourself
        utxos.forEach(txn => {
            if (running_total < (700 + fee)) {
                running_total += txn.satoshis;
                tx.addInput(txn.txid, txn.vout);
                inputs_num += 1;
            }
        });
        tx.addOutput(destination, 700);

        var btc_remaining = (running_total - (700 + fee));
        if (btc_remaining > 0) {
            tx.addOutput(source, btc_remaining);
        }

        var btc = require('bitcoinjs-lib');
        if (amount <= 0.1) {
            alert("Transaction not processed - Amount is too low. ")
            return;
        }

        // payload omni tx
        var data = new Buffer("0000000000000056" + String("0000000000000000" + amount).slice(-16));
        var dataScript = btc.script.nullData.output.encode(data);
        tx.addOutput(dataScript, 1000)

        for (var i = 0; i < inputs_num; i++) {
            tx.sign(i, key);
        }
        var json = {};
        json['rawtx'] = tx.build().toHex();
        fetch('http://omni.safex.io:3001/broadcast', {method: "POST", body: JSON.stringify(json)})
            .then(resp => resp.text())
            .then((resp) => {

                this.setState({
                    transaction_sent: true,
                    transaction_being_sent: false,
                    txid: resp
                });
            });
        }
    

    createKey() {
        this.setState({is_loading: true});

        var key_pair = genkey();

        var address = key_pair.getAddress();

        var key_json = {};
        key_json['public_key'] = address;
        key_json['private_key'] = key_pair.toWIF();
        key_json['safex_bal'] = 0;
        key_json['btc_bal'] = 0;
        key_json['pending_safex_bal'] = 0;
        key_json['pending_btc_bal'] = 0;
        key_json['archived'] = false;

        try {
            var json = JSON.parse(localStorage.getItem('wallet'));
        } catch (e) {
            alert('error parsing the wallet data')
        }


        json['keys'].push(key_json);


        var crypto = require('crypto'),
            algorithm = 'aes-256-ctr',
            password = localStorage.getItem('password');

        var cipher_text = encrypt(JSON.stringify(json), algorithm, password);


        fs.writeFile(localStorage.getItem('wallet_path'), cipher_text, (err) => {
            if (err) {
                alert('problem communicating to the wallet file')
            } else {
                localStorage.setItem('wallet', JSON.stringify(json));
                try {
                    var json2 = JSON.parse(localStorage.getItem('wallet'));
                    this.setState({wallet: json2, keys: json2['keys'], is_loading: false});
                    this.prepareDisplay();
                    alert('key added to wallet')
                } catch (e) {
                    alert('an error adding a key to the wallet contact team@safex.io')
                }

            }
        });
    }

    importKeyChange(e) {
        this.setState({
            import_key: e.target.value
        })
    }

    importKey(e) {
        e.preventDefault();
        try {
            var key_pair = bitcoin.ECPair.fromWIF(e.target.key.value);
            var address = key_pair.getAddress();

            var key_json = {};
            key_json['public_key'] = address;
            key_json['private_key'] = e.target.key.value;
            key_json['safex_bal'] = 0;
            key_json['btc_bal'] = 0;
            key_json['pending_safex_bal'] = 0;
            key_json['pending_btc_bal'] = 0;
            key_json['archived'] = false;


            try {
                var json = JSON.parse(localStorage.getItem('wallet'));
                var key_exists = false;

                for (var i = 0; i < json['keys'].length; i++) {
                    // look for the entry with a matching `code` value
                    if (json['keys'][i].public_key === address) {
                        key_exists = true;
                    }
                }

                if (key_exists === false) {

                    json['keys'].push(key_json);

                    var crypto = require('crypto'),
                        algorithm = 'aes-256-ctr',
                        password = localStorage.getItem('password');

                    var cipher_text = encrypt(JSON.stringify(json), algorithm, password);


                    fs.writeFile(localStorage.getItem('wallet_path'), cipher_text, (err) => {
                        if (err) {
                            console.log(err)
                        } else {
                            localStorage.setItem('wallet', JSON.stringify(json));
                            this.setState({
                                import_key: ''
                            })
                            try {
                                var json2 = JSON.parse(localStorage.getItem('wallet'));
                                this.setState({wallet: json2, keys: json2['keys'], is_loading: false});
                                this.prepareDisplay();
                            } catch (e) {
                                console.log(e);
                            }

                        }
                    });
                } else {
                    console.log('key exists');
                }


            } catch (e) {
                console.log(e);
            }
        } catch (e) {
            alert('invalid private key')
        }


    }

    exportUnencryptedWallet() {
        alert("This will create a file where you can see your private keys. It is a very sensitive file Be responsible with it." +
            "This file is not for importing. It is for showing you the private keys which you can bring into a new wallet." +
            "You import keys using the 'import key' feature in another wallet.")
        var wallet_data = JSON.parse(localStorage.getItem('wallet'));
        var nice_keys = "";
        var keys = wallet_data['keys'];
        keys.map((key) => {
            nice_keys += "private key: " + key.private_key + '\n';
            nice_keys += "public key: " + key.public_key + '\n';
            nice_keys += '\n';
        });
        var date = Date.now();
        fileDownload(nice_keys, date + 'unsafex.txt');

    }

    exportEncryptedWallet() {
        alert("This will create an encrypted file that is your Safex Wallet. You use this file to import it into another wallet for use" +
            "It requires a password, and if you lose the password your precious coins may be irrecoverable.")

        fs.readFile(localStorage.getItem('wallet_path'), (err, fd) => {
            if (err) {
                //if the error is that No File exists, let's step through and make the file
                if (err.code === 'ENOENT') {
                    console.log('error');
                }
            } else {
                var date = Date.now();
                fileDownload(fd, date + 'safexwallet.dat');
            }
        });
    }


    amountChange(receive_amount) {
        this.setState({
            receive_amount: receive_amount.value
        });
    }


    //This function is connected to Send expansion button and receive expansion button
    openSendReceive(key, sendreceive) {
        if (sendreceive === 'send') {
            if (!this.state.collapse_open.send_open && this.state.collapse_open.key !== key || this.state.collapse_open.send_open && this.state.collapse_open.key !== key) {
                this.setState({
                    collapse_open: {
                        key: key,
                        send_open: true,
                        receive_open: false
                    },
                    send_public_key: this.state.keys[key].public_key
                });
            }

            if (this.state.collapse_open.send_open && this.state.collapse_open.key === key) {
                this.setState({
                    collapse_open: {
                        key: key,
                        send_open: false,
                        receive_open: false
                    },
                    send_public_key: ''
                });
            }

            if (!this.state.collapse_open.send_open && this.state.collapse_open.key === key) {
                this.setState({
                    collapse_open: {
                        key: key,
                        send_open: true,
                        receive_open: false
                    },
                    send_public_key: ''
                });
            }
        }
        if (sendreceive === 'receive') {
            if (!this.state.collapse_open.receive_open && this.state.collapse_open.key !== key || this.state.collapse_open.receive_open && this.state.collapse_open.key !== key) {
                this.setState({
                    collapse_open: {
                        key: key,
                        send_open: false,
                        receive_open: true
                    }
                });
            }
            if (this.state.collapse_open.receive_open && this.state.collapse_open.key === key || !this.state.collapse_open.receive_open && this.state.collapse_open.key === key) {
                this.setState({
                    collapse_open: {
                        key: key,
                        send_open: false,
                        receive_open: !this.state.collapse_open.receive_open
                    }
                });
            }
        }
    }

    openHistoryModal(e) {
        document.getElementById("history_txs").innerHTML = "loading...";
        this.setState({
            history_overflow_active: true,
        })
        this.listTransactions(this.state.keys[e].public_key);
    }

    //Activates send_overflow_active state which opens Modal screen displaying transaction pre-confirmation information
    openCoinModal(e) {
        e.preventDefault();
        var key_btc_bal = 0;
        var key_safex_bal = 0;
        this.state.keys.map(key => {
            if (key.public_key === e.target.public_key.value) {
                key_btc_bal = key.btc_bal;
                key_safex_bal = key.safex_bal;
            }

        });
        if ((this.state.send_coin === 'safex' & this.state.send_fee > key_btc_bal) | (this.state.send_coin === 'btc' & this.state.send_total > key_btc_bal)) {
            alert('you do not have enough BTC to cover the fee');
        } else if (this.state.send_coin === 'safex' & this.state.send_amount > key_safex_bal) {
            alert('you do not have enough SAFEX to cover this transaction');
        } else if (this.state.send_coin === 'btc' & this.state.send_total > key_btc_bal) {
            alert('you do not have enough BTC to cover this transaction');
        } else if (e.target.destination.value === '') {
            alert('destination field is empty');
        } else {
            try {
                bitcore.Address.fromString(e.target.destination.value)
                this.setState({
                    send_overflow_active: true,
                    send_to: e.target.destination.value,
                    send_keys: {
                        public_key: e.target.public_key.value,
                        private_key: e.target.private_key.value
                    }
                })
            } catch (e) {
                alert('destination address is invalid');
            }

        }

    }

    changePassword(e) {

        e.preventDefault();
        var now_pass = e.target.old_pass.value;
        var new_pass = e.target.new_pass.value;
        var repeat_pass = e.target.repeat_pass.value;


        //check if the new password field is full
        if (new_pass.length > 0) {
            //check that the new password matches the repeated password
            if (new_pass === repeat_pass) {

                //read from the expected path the encrypted wallet
                fs.readFile(localStorage.getItem('wallet_path'), (err, fd) => {
                    if (err) {
                        //if the error is that No File exists, let's step through and make the file
                        if (err.code === 'ENOENT') {
                            alert('no wallet was found');
                        }
                    } else {

                        //prepare to decrypt the wallet file from the path
                        var crypto = require('crypto'),
                            algorithm = 'aes-256-ctr',
                            password = now_pass;

                        //decrypt the wallet
                        var decrypted_wallet = decrypt(fd.toString(), algorithm, password);

                        //try to parse the decrypted wallet that it is valid
                        try {

                            var parse_wallet = JSON.parse(decrypted_wallet);

                            //check the version number of the wallet
                            if (parse_wallet['version'] === '1') {

                                const hash1 = crypto.createHash('sha256');
                                const hash2 = crypto.createHash('sha256');

                                //hash the wallet on the path
                                hash1.update(decrypted_wallet);

                                //hash the wallet in localstorage
                                hash2.update(localStorage.getItem('wallet'));

                                //check that both hashes the active wallet and encrypted wallet are identical
                                if (hash1.toString() === hash2.toString()) {
                                    var password = new_pass;

                                    //encrypt the wallet data with the new password
                                    var encrypted_wallet = encrypt(decrypted_wallet, algorithm, password);

                                    //write the new file to the path
                                    fs.writeFile(localStorage.getItem('wallet_path'), encrypted_wallet, (err) => {
                                        if (err) {
                                            alert('there was a problem writing the new encrypted file to disk')
                                        } else {
                                            //set the active password and wallet to the new file
                                            localStorage.setItem('password', new_pass);
                                            localStorage.setItem('wallet', decrypted_wallet);
                                            alert('password has been changed')
                                        }
                                    });
                                }
                            } else {
                                alert('wrong password')
                            }
                        } catch (e) {
                            alert('wrong password');
                        }
                    }
                });
            } else {
                alert('new password does not match repeated password')
            }
        } else {
            alert('new password field is empty')
        }
    }


    closeCoinModal() {
        this.setState({
            send_overflow_active: false,
            send_to: '',
            send_keys: {
                public_key: '',
                private_key: ''
            }
        })
    }

    closeHistoryModal() {
        this.setState({
            history_overflow_active: false,
            history_key: ''
        })
    }

    closeSuccessModal(e) {
        e.preventDefault();
        this.setState({
            transaction_sent: false,
            send_overflow_active: false,
            send_to: '',
            send_keys: {
                public_key: '',
                private_key: ''
            }
        });
        this.prepareDisplay();
        setTimeout(() => {
            this.prepareDisplay();
        }, 35000)
    }

    openSettingsModal(e) {
        e.preventDefault();
        this.setState({
            settings_active: true
        });

    }

    closeSettingsModal() {
        this.setState({
            settings_active: false
        });
    }

    //This is fired when amount is changed
    sendAmountOnChange(e) {
        var send_fee = this.state.send_fee;
        var send_total = 0;
        if (this.state.send_coin === 'safex') {
            send_total = parseInt(e.target.value);
            this.setState({
                send_amount: parseInt(e.target.value),
                send_total: parseInt(send_total)
            });
        } else {
            send_total = parseFloat(e.target.value) + parseFloat(send_fee);
            this.setState({
                send_amount: e.target.value,
                send_total: send_total.toFixed(8)
            });
        }
    }

    //This is fired when fee is changed
    sendFeeOnChange(e) {
        var send_amount = this.state.send_amount;
        var send_fee = parseFloat(e.target.value);

        if (this.state.send_coin === 'safex') {
            var send_total = parseFloat(send_amount);
        } else {
            var send_total = parseFloat(send_fee) + parseFloat(send_amount);
        }
        this.setState({
            send_fee: send_fee,
            send_total: send_total.toFixed(8)
        });
    }

    //This is protection against way too small fees
    sendFeeOnBlur(e) {
        var send_fee;
        if (this.state.send_fee <= 0.00001) {
            send_fee = 0.00001;
        } else {
            send_fee = this.state.send_fee;
        }
        this.setState({
            send_fee: send_fee
        })
    }

    //This fires the currency selection method and sets the currency state
    sendCoinChoose(coin) {
        this.setState({
            send_coin: coin
        });
        this.sendTotalAdjustCoinChange(coin);
    }

    //This is fired when change of currency is selected BTC SAFEX
    sendTotalAdjustCoinChange(coin) {
        var send_amount = this.state.send_amount;
        if (this.state.average_fee > 0) {
            var send_fee = this.state.average_fee;
        } else {
            var send_fee = this.state.send_fee;
        }

        //if this.state.average_fee > 0 send_fee == fast. Set active fee selection fastest.
        if (coin === 'safex') {
            send_amount = parseFloat(this.state.send_amount).toFixed(0);
            var send_total = parseFloat(send_amount);
            this.setState({
                send_amount: 1,
                send_fee: parseFloat(this.state.average_fee).toFixed(8),
                send_total: 1,
                active_fee: 'fast'
            });
        } else {
            var send_total = parseFloat(this.state.average_fee) / 4 + 0.00001;
            this.setState({
                send_amount: 0.00001.toFixed(8),
                send_fee: parseFloat(parseFloat(this.state.average_fee) / 4).toFixed(8),
                send_total: send_total.toFixed(8),
                active_fee: 'fast'
            });
        }

    }

    feeChange(speed) {
        var coin = this.state.send_coin;
        if (coin === 'safex') {
            if (speed === 'fast') {
                this.setState({
                    send_fee: parseFloat(this.state.average_fee).toFixed(8),
                    active_fee: speed
                });
            }
            if (speed === 'med') {
                this.setState({
                    send_fee: parseFloat(parseFloat(this.state.average_fee) / 2).toFixed(8),
                    active_fee: speed
                });
            }
            if (speed === 'slow') {
                this.setState({
                    send_fee: parseFloat(parseFloat(this.state.average_fee) / 4).toFixed(8),
                    active_fee: speed
                });
            }
        }
        if (coin === 'btc') {
            if (speed === 'fast') {
                this.setState({
                    send_fee: parseFloat(parseFloat(this.state.average_fee) / 4).toFixed(8),
                    send_total: parseFloat(parseFloat(this.state.send_amount) + parseFloat(this.state.average_fee) / 4).toFixed(8),
                    active_fee: speed
                });
            }
            if (speed === 'med') {
                this.setState({
                    send_fee: parseFloat(parseFloat(this.state.average_fee) / 6).toFixed(8),
                    send_total: parseFloat(parseFloat(this.state.send_amount) + parseFloat(this.state.average_fee) / 6).toFixed(8),
                    active_fee: speed
                });
            }
            if (speed === 'slow') {
                this.setState({
                    send_fee: parseFloat(parseFloat(this.state.average_fee) / 8).toFixed(8),
                    send_total: parseFloat(parseFloat(this.state.send_amount) + parseFloat(this.state.average_fee) / 8).toFixed(8),
                    active_fee: speed
                });
            }
        }
    }

    listTransactions(key) {
        var render = '';
        var bodyFormData = new FormData();
        bodyFormData.set('addr', key);

        axios({
            method: 'post',
            url: 'https://api.omniexplorer.info/v1/transaction/address/0',
            data: bodyFormData,
            config: { 
                headers: {'Content-Type': 'multipart/form-data', 'origin': '', 'referrer': '', 'referer': ''}
            }
        })
          .then(function (response) {
            localStorage.setItem("history_txs", JSON.stringify(response.data.transactions));
            var history = JSON.stringify(response.data.transactions);
            var render = '';
                JSON.parse(history).forEach((tx) => {
                    var direction = tx['referenceaddress'] === key ? "Received🔸" : "SENT🔻";
                    var dateTime = new Date(tx['blocktime'] * 1000);
                    var confirmations = tx['confirmations'] > 15 ? "(16/16)" : "("+ tx['confirmations'] + "/16)"
                    render +=`
                        <div className="col-xs-10 history" style="min-width:650px;margin-left:70px;">
                            <span className="coin-name">SAFEX</span> `+ direction +` <pre class="date">` + dateTime + `</pre><br />
                            <pre class="address"><b>TX</b> `+ tx['txid'] +`</pre><br /> 
                            <pre class="address">`+ tx['sendingaddress'] +`</pre> ➡ <pre class="address">`+ tx['referenceaddress'] +`</pre>
                        </div>
                        <div className="col-xs-2">
                            `+ tx['amount'] +` safex <br />
                            `+ confirmations +` confirmations
                        </div>`;
                });
                document.getElementById("history_txs").innerHTML = render; 
            })
          .catch(function (error) {
            console.log(error);
            alert("Could not fetch tx history...");
          });
    }

    sendToArchive(index) {
        try {
            var json = JSON.parse(localStorage.getItem('wallet'));

            var json_index;
            json_index = json.keys[index];

            json_index.archived = true;

            json.keys[index] = json_index;

            var crypto = require('crypto'),
                algorithm = 'aes-256-ctr',
                password = localStorage.getItem('password');

            var cipher_text = encrypt(JSON.stringify(json), algorithm, password);

            fs.writeFile(localStorage.getItem('wallet_path'), cipher_text, (err) => {
                if (err) {
                    alert('problem communicating to the wallet file')
                } else {
                    localStorage.setItem('wallet', JSON.stringify(json));
                    try {
                        var json2 = JSON.parse(localStorage.getItem('wallet'));
                        json2['keys'].forEach((key) => {
                                var currentIndex = this.state.keys.findIndex(i => i.public_key === key['public_key'])
                                key['safex_bal'] = this.state.keys[currentIndex].safex_bal;
                                key['btc_bal'] = this.state.keys[currentIndex].btc_bal;
                                key['pending_safex_bal'] = this.state.keys[currentIndex].pending_safex_bal;
                                key['pending_btc_bal'] = this.state.keys[currentIndex].pending_btc_bal;

                        });

                        this.setState({wallet: json2, keys: json2['keys'], is_loading: false});
                    } catch (e) {
                        alert('an error adding a key to the wallet contact team@safex.io')
                    }

                }
            });
        } catch (e) {
            alert('error parsing the wallet data')
        }
    }

    removeFromArchive(index) {
        try {
            var json = JSON.parse(localStorage.getItem('wallet'));

            var json_index;
            json_index = json.keys[index];

            json_index.archived = false;

            json.keys[index] = json_index;

            var crypto = require('crypto'),
                algorithm = 'aes-256-ctr',
                password = localStorage.getItem('password');

            var cipher_text = encrypt(JSON.stringify(json), algorithm, password);


            fs.writeFile(localStorage.getItem('wallet_path'), cipher_text, (err) => {
                if (err) {
                    alert('problem communicating to the wallet file')
                } else {
                    localStorage.setItem('wallet', JSON.stringify(json));
                    try {
                        var json2 = JSON.parse(localStorage.getItem('wallet'));
                        json2['keys'].forEach((key) => {
                                var currentIndex = this.state.keys.findIndex(i => i.public_key === key['public_key'])
                                key['safex_bal'] = this.state.keys[currentIndex].safex_bal;
                                key['btc_bal'] = this.state.keys[currentIndex].btc_bal;
                                key['pending_safex_bal'] = this.state.keys[currentIndex].pending_safex_bal;
                                key['pending_btc_bal'] = this.state.keys[currentIndex].pending_btc_bal;

                        });
                        this.setState({wallet: json2, keys: json2['keys'], is_loading: false});
                        this.prepareDisplay(json.keys[index]);
                    } catch (e) {
                        alert('an error adding a key to the wallet contact team@safex.io')
                    }
                }
            });
        } catch (e) {
            alert('error parsing the wallet data')
        }


    }

    setArchiveView() {
        this.setState({archive_active: true});
    }

    setHomeView() {
        this.setState({archive_active: false});
    }


    render() {
        const {keys, archive_active, safex_price, btc_price} = this.state;

        var table = Object.keys(keys).map((key) => {

            return <div className={keys[key].archived === archive_active
            | (!keys[key].hasOwnProperty('archived') && archive_active === false)
                ? 'col-xs-12 single-key'
                : 'col-xs-12 single-key hidden-xs hidden-sm hidden-md hidden-lg'} key={key}>
                <div className="col-xs-7">
                    <div className="key">{keys[key].public_key}</div>
                </div>
                <div className="pull-right">
                    <button disabled={keys[key].pending_btc_bal >= 0 && this.state.average_fee !== 0
                        ? ''
                        : 'disabled'} onClick={this.openSendReceive.bind(this, key, 'send')}>SEND <img
                        src="images/send.png"
                        alt="Send"/></button>
                    <button onClick={this.openSendReceive.bind(this, key, 'receive')}>RECEIVE <img
                        src="images/import.png" alt="Receive"/></button>
                </div>


                <div className="col-xs-12">
                    <div className="row amounts">
                        
                        <div className="row amounts">
                            <button onClick={() => this.sendToArchive(key)}
                                    className={keys[key].archived === false
                                    | (!keys[key].hasOwnProperty('archived') && archive_active === false)
                                        ? 'archive-button'
                                        : 'archive-button hidden-xs hidden-sm hidden-md hidden-lg'}>
                                <span>TO ARCHIVE</span>
                            </button>
                            <button onClick={() => this.openHistoryModal(key)}
                                    className='archive-button history-button'>
                                <span>HISTORY</span>
                            </button>


                            <button onClick={() => this.removeFromArchive(key)}
                                    className={keys[key].archived === true
                                    | (!keys[key].hasOwnProperty('archived') && archive_active === true)
                                        ? 'archive-button'
                                        : 'archive-button hidden-xs hidden-sm hidden-md hidden-lg'}>
                                <span>TO HOME</span>
                            </button>
                        </div>


                        <div className="col-xs-12 amounts">
                            <span className="col-xs-12 amount">
                                <span>
                                    {
                                        parseFloat(keys[key].safex_bal)
                                    }
                                    {
                                        keys[key].pending_safex_bal > 0
                                        | keys[key].pending_safex_bal < 0
                                            ? ' (pending ' + keys[key].pending_safex_bal + ')'
                                            : ''
                                    }
                                </span>
                                <span className="coin-name">Safex</span>
                                <span>
                                    ${(keys[key].safex_bal * safex_price).toFixed(2)}
                                </span>
                            </span>
                        </div>
                        <div className="col-xs-12 amounts">
                            <span className="col-xs-12 amount">
                                <span>
                                    {
                                        keys[key].pending_btc_bal < 0
                                            ? (parseFloat(keys[key].btc_bal) + parseFloat(keys[key].pending_btc_bal)).toFixed(8)
                                            : keys[key].btc_bal
                                    }
                                    {
                                        keys[key].pending_btc_bal > 0
                                        | keys[key].pending_btc_bal < 0
                                            ? ' (pending ' + keys[key].pending_btc_bal + ')'
                                            : ''
                                    }
                                </span>
                                <span className="coin-name">Bitcoin</span>
                                <span>
                                    ${(keys[key].btc_bal * btc_price).toFixed(2)}
                                </span>

                            </span>
                        </div>
                    </div>
                </div>


                <form onSubmit={this.openCoinModal}
                      className={this.state.collapse_open.send_open && this.state.collapse_open.key === key
                          ? 'col-xs-12 form-inline form-send active'
                          : 'col-xs-12 form-inline form-send'}>
                    <div className="row">
                        <div className="col-xs-12 sendCloseButton">
                            <div onClick={this.openSendReceive.bind(this, key, 'send')} className="close text-right">
                                X
                            </div>
                        </div>
                    </div>
                    <div className="row">
                        <div className="col-xs-8 send-left">
                            <label htmlFor="which">Currency</label>
                            <img className={this.state.send_coin === 'safex'
                                ? 'coin active'
                                : 'coin'} onClick={this.sendCoinChoose.bind(this, 'safex')} src="images/safex-coin.png"
                                 alt="Safex Coin"/>
                            <img className={this.state.send_coin === 'btc'
                                ? 'coin active'
                                : 'coin'} onClick={this.sendCoinChoose.bind(this, 'btc')} src="images/btc-coin.png"
                                 alt="Bitcoin Coin"/>
                            <input type="hidden" name="which" readOnly value={this.state.send_coin}></input>
                            <input type="hidden" name="private_key" readOnly value={keys[key].private_key}></input>
                            <input type="hidden" name="public_key" readOnly value={keys[key].public_key}></input>
                            <div className="input-group">
                                <span className="input-group-addon" id="basic-addon1">TO:</span>
                                <input name="destination" type="text" className="form-control" placeholder="Address"
                                       aria-describedby="basic-addon1"/>
                            </div>
                        </div>
                        <div className="col-xs-4">
                            <div className="form-group">
                                <label htmlFor="amount">Amount<span className={this.state.send_coin === "safex"
                                    ? ''
                                    : 'hidden-xs hidden-sm hidden-md hidden-lg'}>(Safex)</span>:</label>
                                <input type="number" name="amount" onChange={this.sendAmountOnChange}
                                       value={this.state.send_amount}/>
                            </div>
                            <div className="form-group">
                                <label htmlFor="fee">Fee(BTC):</label>
                                <input type="number" name="fee" onChange={this.sendFeeOnChange}
                                       onBlur={this.sendFeeOnBlur} value={this.state.send_fee}/>
                            </div>
                            <div className="form-group fee-buttons">
                                <span className={this.state.active_fee === 'slow'
                                    ? 'active'
                                    : ''} onClick={this.feeChange.bind(this, 'slow')}>Slow</span>
                                <span className={this.state.active_fee === 'med'
                                    ? 'active'
                                    : ''} onClick={this.feeChange.bind(this, 'med')}>Med</span>
                                <span className={this.state.active_fee === 'fast'
                                    ? 'active'
                                    : ''} onClick={this.feeChange.bind(this, 'fast')}>Fast</span>
                            </div>
                            <div className="form-group">
                                <label htmlFor="total">Total:</label>
                                <input type="number" name="total" readOnly value={this.state.send_total}></input>
                            </div>
                            <button type="submit">Send</button>
                        </div>
                    </div>
                </form>
                <div className={this.state.collapse_open.receive_open && this.state.collapse_open.key === key
                    ? 'col-xs-12 receive active'
                    : 'col-xs-12 receive'}>
                    <div className="row">
                        <div className="col-xs-12 sendCloseButton">
                            <div onClick={this.openSendReceive.bind(this, key, 'receive')} className="close">
                                X
                            </div>
                        </div>
                    </div>
                    <div className="col-xs-12">
                        <label htmlFor="receive-address">Address:</label>
                        <input name="receive-address" value={keys[key].public_key}/>
                    </div>
                    <div className="col-xs-8">
                        <label htmlFor="amount">Amount:</label>
                        <input type="amount" placeholder="1" onChange={this.amountChange.bind(this)}
                               value={this.state.receive_amount}/>
                    </div>
                    <div className="col-xs-4">
                        <div className="row">
                            <div className="col-xs-6">
                                <QRCode
                                    value={"bitcoin:" + keys[key].public_key + "?amount=" + this.state.receive_amount}/>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        });

        return (
            <div className="wallet-page">
                <Navigation/>
                <div className="container key-buttons status">
                    <button disabled>Status:
                        <span className={this.state.btc_sync
                            ? 'status-green'
                            : 'status-red'}>BTC</span>
                        <span className={this.state.safex_sync
                            ? 'status-green'
                            : 'status-red'}>SAFEX</span>
                    </button>
                    <button disabled>
                        {this.state.status_text}
                    </button>
                </div>
                <div className="container key-buttons">
                    <div className="row">
                        <div className="col-xs-12">
                            <button onClick={this.createKey}>Create key</button>
                            <form onChange={this.importKeyChange} onSubmit={this.importKey}>
                                <input name="key" value={this.state.import_key}></input>
                                <button type="submit">Import key</button>
                            </form>
                            <button className="settings" onClick={this.openSettingsModal}><img
                                src="images/settings.png"/></button>
                            <button className={this.state.refreshTimer === 0
                                ? 'refresh-button'
                                : 'refresh-button disabled'} onClick={this.refreshWallet}><img
                                src="images/refresh.png"/><span>{this.state.refreshTimer + 's'}</span></button>
                        </div>
                    </div>
                </div>
                <div className="container">
                    <div className="row wallet-tabs">
                        <div className="col-xs-12">
                            <div onClick={this.setHomeView}
                                 className={archive_active === false ? 'btn btn-default active' : 'btn btn-default'}>
                                Home
                            </div>
                            <div onClick={this.setArchiveView}
                                 className={archive_active === true ? 'btn btn-default active' : 'btn btn-default'}>
                                Archive
                            </div>
                        </div>
                    </div>
                </div>
                <div className="container keys-container">
                    <div className="col-xs-12">
                        <div className="row">
                            {table}
                        </div>
                    </div>
                </div>
                <div className={this.state.history_overflow_active
                    ? 'overflow historyModal active'
                    : 'overflow historyModal'}>
                    <div className="col-xs-12">
                        <h3>History <span className="close" onClick={this.closeHistoryModal}>X</span></h3>
                            <div className="col-xs-12" id="history_txs">
                            loading...
                            </div>
                    </div>
                </div>

                <div className={this.state.send_overflow_active
                    ? 'overflow sendModal active'
                    : 'overflow sendModal'}>
                    <form className="container" onSubmit={this.sendCoins}>
                        <div className="col-xs-12">
                            <h3>Sending <span className="close" onClick={this.closeCoinModal}>X</span></h3>
                            <div className="col-xs-10 col-xs-offset-1">
                                <div className="col-xs-12">
                                    <div className="currency">
                                        Currency: <img className={this.state.send_coin === 'safex'
                                        ? 'coin'
                                        : 'coin hidden-xs hidden-sm hidden-md hidden-lg'}
                                                       onClick={this.sendCoinChoose.bind(this, 'safex')}
                                                       src="images/safex-coin.png" alt="Safex Coin"/>
                                        <img className={this.state.send_coin === 'btc'
                                            ? 'coin'
                                            : 'coin hidden-xs hidden-sm hidden-md hidden-lg'}
                                             onClick={this.sendCoinChoose.bind(this, 'btc')} src="images/btc-coin.png"
                                             alt="Bitcoin Coin"/>
                                    </div>
                                </div>
                                <div className="input-group">
                                    <span className="input-group-addon" id="basic-addon1">FROM:</span>
                                    <input name="from" type="text" className="form-control" readOnly
                                           value={this.state.send_keys.public_key} placeholder="Address"
                                           aria-describedby="basic-addon1"/>
                                </div>
                                <div className="input-group">
                                    <span className="input-group-addon" id="basic-addon1">TO:</span>
                                    <input name="destination" type="text" className="form-control" readOnly
                                           value={this.state.send_to} placeholder="Address"
                                           aria-describedby="basic-addon1"/>
                                </div>
                                <input type="hidden" readOnly name="private_key"
                                       value={this.state.send_keys.private_key}></input>
                                <input type="hidden" readOnly name="public_key"
                                       value={this.state.send_keys.public_key}></input>
                                <div className="col-xs-6 col-xs-offset-3">
                                    <div className="form-group">
                                        <label htmlFor="amount">Amount:</label>
                                        <input readOnly name="amount" value={this.state.send_amount}/>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="fee">Fee(BTC):</label>
                                        <input readOnly name="fee" value={this.state.send_fee}/>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="total">Total:</label>
                                        <input readOnly name="total" value={this.state.send_total}></input>
                                    </div>
                                    <button className=''
                                            type="submit"> {this.state.transaction_being_sent ? 'Pending' : 'CONFIRM'}</button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                <div className={this.state.transaction_sent
                    ? 'overflow sendModal active'
                    : 'overflow sendModal'}>
                    <form className="container" onSubmit={this.closeSuccessModal}>
                        <div className="col-xs-12">
                            <h3>Sent <span className="close" onClick={this.closeSuccessModal}>X</span></h3>
                            <div className="col-xs-10 col-xs-offset-1">
                                <div className="col-xs-12">
                                    <div className="currency">
                                        Currency: <img className={this.state.send_coin === 'safex'
                                        ? 'coin'
                                        : 'coin hidden-xs hidden-sm hidden-md hidden-lg'}
                                                       onClick={this.sendCoinChoose.bind(this, 'safex')}
                                                       src="images/safex-coin.png" alt="Safex Coin"/>
                                        <img className={this.state.send_coin === 'btc'
                                            ? 'coin'
                                            : 'coin hidden-xs hidden-sm hidden-md hidden-lg'}
                                             onClick={this.sendCoinChoose.bind(this, 'btc')} src="images/btc-coin.png"
                                             alt="Bitcoin Coin"/>
                                    </div>
                                </div>
                                <div className="input-group">
                                    <span className="input-group-addon" id="basic-addon1">FROM:</span>
                                    <input name="from" type="text" className="form-control" readOnly
                                           value={this.state.send_keys.public_key} placeholder="Address"
                                           aria-describedby="basic-addon1"/>
                                </div>
                                <div className="input-group">
                                    <span className="input-group-addon" id="basic-addon1">TO:</span>
                                    <input name="destination" type="text" className="form-control" readOnly
                                           value={this.state.send_to} placeholder="Address"
                                           aria-describedby="basic-addon1"/>
                                </div>
                                <div className="input-group">
                                    <span className="input-group-addon" id="basic-addon1">TX ID:</span>
                                    <input name="destination" type="text" className="form-control" readOnly
                                           value={this.state.txid} placeholder="Address"
                                           aria-describedby="basic-addon1"/>
                                </div>
                                <input type="hidden" readOnly name="private_key"
                                       value={this.state.send_keys.private_key}></input>
                                <input type="hidden" readOnly name="public_key"
                                       value={this.state.send_keys.public_key}></input>
                                <div className="col-xs-6 col-xs-offset-3">
                                    <div className="form-group">
                                        <label htmlFor="amount">Amount:</label>
                                        <input readOnly name="amount" value={this.state.send_amount}/>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="fee">Fee(BTC):</label>
                                        <input readOnly name="fee" value={this.state.send_fee}/>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="total">Total:</label>
                                        <input readOnly name="total" value={this.state.send_total}></input>
                                    </div>
                                    <button type="submit">Close X</button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                <div className={this.state.settings_active
                    ? 'overflow sendModal settingsModal active'
                    : 'overflow sendModal settingsModal'}>
                    <form className="container" onSubmit={this.closeSettingsModal}>
                        <div className="col-xs-12">
                            <h3>Settings <span className="close" onClick={this.closeSettingsModal}>X</span></h3>
                            <div className="col-xs-10 col-xs-offset-1">
                                <form className="col-xs-12 col-sm-6" onSubmit={this.changePassword}>
                                    <div className="form-group">
                                        <label htmlFor="old_pass">Old Password:</label>
                                        <input type="password" name="old_pass"/>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="new_pass">New Password:</label>
                                        <input type="password" name="new_pass"/>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="repeat_pass">Repeat Password:</label>
                                        <input type="password" name="repeat_pass"/>
                                    </div>
                                    <div className="col-xs-12">
                                        <div className="row">
                                            <button type="submit">Submit</button>
                                        </div>
                                    </div>
                                </form>
                                <div className="col-xs-12 col-sm-6">
                                    <button onClick={this.exportEncryptedWallet}>Export Encrypted Wallet (.dat)</button>
                                    <button onClick={this.exportUnencryptedWallet}>Export Unencrypted Keys</button>
                                    <button onClick={this.logout}>Logout</button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        );
    }
}


Wallet.contextTypes = {
    router: React.PropTypes.object.isRequired
}
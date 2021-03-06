/**
 * Created by i.n. on 10.04.2015.
 */

var WebitelCommandTypes = require('../consts').WebitelCommandTypes,
    log = require('../lib/log')(module),
    auth = require('../routes/V2/auth'),
    checkUser = require('../middleware/checkUser'),
    eventCollection = require('./EventsCollection'),
    ACCOUNT_EVENTS = require('../consts').ACCOUNT_EVENTS,
    handleSocketError = require('../middleware/handleSocketError'),
    User = require('../lib/User');

commandEmitter.on('wss::' + WebitelCommandTypes.SetStatus.name, function (execId, args, ws) {
    console.dir(args);
    try {
        var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Account.Change);
        if (!_caller) return;

        var _value = args['status'];
        if (!_value || !args['userId']) {
            // TODO RESPONSE bad request
            return;
        };
        if (args['tag']) {
            _value += ' (' + args['tag'] + ')';
        };
        webitel.userUpdate(_caller, args['userId'], 'status', _value, function (res) {
            getCommandResponseJSON(ws, execId, res);
        });

        eslConn.bgapi('callcenter_config agent set state ' + args['userId'] + " 'Waiting'", function (res) {
            console.log(res.body)
        });

    } catch (e) {
        log.error(e['message']);
    };
});

//+
commandEmitter.on('wss::' + WebitelCommandTypes.Auth.name, function (execId, args, ws) {
    checkUser(args['account'], args['secret'], function (err, userParam) {
        if (err) {
            try {
                ws.send(JSON.stringify({
                    'exec-uuid': execId,
                    'exec-complete': '+ERR',
                    'exec-response': {
                        'login': err
                    }
                }));
//                                ws.close();
            } catch (e) {
                log.warn('User socket close:', e.message);
            };
        } else {
            try {
                var webitelId = args['account'];
                ws['upgradeReq']['webitelId'] = webitelId;
                var user = Users.get(webitelId);
                if (!user) {
                    user = new User(args['account'], ws, {
                        attr: userParam,
                        logged: false
                    });
                    Users.add(webitelId, user);
                    /*Users.add(webitelId, {
                        ws: [ws],
                        id: args['account'],
                        logged: false,
                        attr: userParam
                    });*/
                } else {
                    user['attr'] = userParam;
                    user.ws.push(ws);
                };
                log.debug('Users session: ', Users.length());

                ws.send(JSON.stringify({
                    'exec-uuid': execId,
                    'exec-complete': '+OK',
                    'exec-response': {
                        'login': webitelId,
                        'role': userParam.role.name,
                        'domain': userParam.domain,
                        'cc-agent': userParam['cc-agent'],
                        'state': userParam['state'],
                        'status': userParam['status'],
                        'description': userParam['description'],
                        'ws-count': user.ws.length,
                        'cc-logged': !!user['cc-logged']
                    }
                }));
            } catch (e) {
                log.warn('User socket close:', e.message);
            }
        }
    });
});

// TODO перенести в модуль eventCollection
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Event.On.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Event.On);
    if (!_caller) return;
    var _all = args.all;
    eventCollection.addListener(args['event'], ws['upgradeReq']['webitelId'], ws['webitelSessionId'],
        function (err, resStr) {
            var res = {
                "body": err
                    ? "-ERR: " + err.message
                    : resStr
            };
            // TODO
            try {
                if (_all)
                    _caller['_myEvents'][args['event']] = true;
            } catch (e) {
                log.error(e);
            };
            getCommandResponseJSON(ws, execId, res);
        });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Event.Off.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Event.Off);
    if (!_caller) return;
    eventCollection.removeListener(args['event'], ws['upgradeReq']['webitelId'], ws['webitelSessionId'],
        function (err, resStr) {
            var res = {
                "body": err
                    ? "-ERR: " + err.message
                    : resStr
            };
            try {
                delete _caller['_myEvents'][args['event']];
            } catch (e) {
                log.error(e);
            };
            getCommandResponseJSON(ws, execId, res);
        });
});
// END TODO
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Logout.name, function (execId, args, ws) {
    ws['upgradeReq']['logged'] = false;
    var jsonEvent,
        webitelId = ws['upgradeReq']['webitelId'] || '',
        _domain = webitelId.split('@')[1],
        _id = webitelId.split('@')[0],
        _user = Users.get(webitelId);
    if (_user) {
        try {
            _user.logged = false;
            jsonEvent = getJSONUserEvent(ACCOUNT_EVENTS.OFFLINE, _domain, _id);
            log.debug(jsonEvent['Event-Name'] + ' -> ' + webitelId);
            Domains.broadcast(_domain, jsonEvent);
        } catch (e) {
            log.warn('Broadcast account event: ', domain);
        };
        sendCommandResponseWebitel(ws, execId, {
            status: '+OK',
            body: 'Successfuly logged out.'
        });
    } else {
        sendCommandResponseWebitel(ws, execId, {
            status: '-ERR',
            body: 'Error logged out.'
        });
    };
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Login.name, function (execId, args, ws) {
    ws['upgradeReq']['logged'] = true;
    var jsonEvent,
        webitelId = ws['upgradeReq']['webitelId'] || '',
        _domain = webitelId.split('@')[1],
        _id = webitelId.split('@')[0],
        _user = Users.get(webitelId);
    if (_user) {
        try {
            _user.logged = true;
            jsonEvent = getJSONUserEvent(ACCOUNT_EVENTS.ONLINE, _domain, _id);
            log.debug(jsonEvent['Event-Name'] + ' -> ' + webitelId);
            Domains.broadcast(_domain, jsonEvent);
        } catch (e) {
            log.warn('Broadcast account event: ', domain);
        };
        sendCommandResponseWebitel(ws, execId, {
            status: '+OK',
            body: 'Successfuly logged in.'
        });
    } else {
        sendCommandResponseWebitel(ws, execId, {
            status: '-ERR',
            body: 'Error logged in.'
        });
    };
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Token.Generate.name, function (execId, args, ws) {
    var username = ws['upgradeReq']['webitelId'];
    if (!username) {
        ws.send(JSON.stringify({
            'exec-uuid': execId,
            'exec-complete': '+ERR',
            'exec-response': {
                'response': '-ERR permission denied!'
            }
        }));
        return null
    };

    auth.getTokenObject(username, args['password'], function (err, dbUser) {
        if (err) {
            ws.send(JSON.stringify({
                'exec-uuid': execId,
                'exec-complete': '+ERR',
                'exec-response': {
                    'response': err
                }
            }));
            return;
        }
        getCommandResponseJSON(ws, execId, {
            body: JSON.stringify(dbUser)
        });
    });
});

//+
commandEmitter.on('wss::' + WebitelCommandTypes.ListUsers.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.ListUsers);
    if (!_caller) return;
    webitel.list_users(_caller, args['domain'] || '', function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Domain.List.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Domain.List);
    if (!_caller) return;
    webitel.domainList(_caller, args['customerId'] || '', function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Domain.Create.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Domain.Create);
    if (!_caller) return;
    webitel.domainCreate(_caller, args['name'] || '', args['customerId'] || '', args['parameters'], function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Domain.Remove.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Domain.Remove);
    if (!_caller) return;
    webitel.domainRemove(_caller, args['name'] || '', function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Domain.Item.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Domain.Item);
    if (!_caller) return;
    webitel.domainItem(_caller, args['name'] || '', function(res) {
        var _res = res;
        try {
            if (_res['body'] instanceof Object) {
                _res['body'] = JSON.stringify(_res['body']);
            }
        } catch (e) {
            log.error(e['message']);
        };
        getCommandResponseV2JSON(ws, execId, _res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Domain.Update.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Domain.Update);
    if (!_caller) return;
    var params = args['params'];
    webitel.updateDomain(_caller, args['name'] || '', {
        "type": params && params['type'],
        "params": params && params['attribute']
    }, function(res) {
        var _res = res;
        try {
            if (_res['body'] instanceof Object) {
                _res['body'] = JSON.stringify(_res['body']);
            }
        } catch (e) {
            log.error(e['message']);
        };
        getCommandResponseV2JSON(ws, execId, _res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Account.List.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Account.List);
    if (!_caller) return;
    webitel.userList(_caller, args['domain'] || '', function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Account.Create.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Account.Create);
    if (!_caller) return;
    webitel.userCreate(_caller, args, function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Account.Change.name, function (execId, args, ws) {
    try {
        var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Account.Change);
        if (!_caller) return;
        if (args['param'] instanceof Object) {
            var _user = (typeof args['user'] === 'string' ? args['user'] : "").split('@');
            webitel.userUpdateV2(_caller, _user[0], _user[1], args['param'], function (res) {
                getCommandResponseJSON(ws, execId, res);
            });
        } else {
            // TODO del userUpdate
            webitel.userUpdate(_caller, args['user'] || '', args['param'] || '', args['value'] || '', function (res) {
                getCommandResponseJSON(ws, execId, res);
            });
        }
        ;
    } catch (e) {
        log.error(e['message']);
    }
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Account.Remove.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Account.Remove);
    if (!_caller) return;
    webitel.userRemove(_caller, args['user'] || '', function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Account.Item.name, function (execId, args, ws) {
    try {
        var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Account.Item);
        if (!_caller) return;
        var _user = (args['user'] || '').split('@');
        webitel.userItem(_caller, _user[0] || '', _user[1] || '', function (res) {
            getCommandResponseV2JSON(ws, execId, res);
        });
    } catch (e) {
        log.error(e['message']);
    }
});

commandEmitter.on('wss::' + WebitelCommandTypes.Device.List.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Device.List);
    if (!_caller) return;
    webitel.deviceList(_caller, args['domain'] || '', function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});

commandEmitter.on('wss::' + WebitelCommandTypes.Device.Create.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Device.Create);
    if (!_caller) return;
    webitel.deviceCreate(_caller, args['type'] || '', args['param'] || '', function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});

commandEmitter.on('wss::' + WebitelCommandTypes.Device.Change.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Device.Change);
    if (!_caller) return;
    webitel.deviceUpdate(_caller, args['device'] || '', args['param'] || '', args['value'] || '', function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});

commandEmitter.on('wss::' + WebitelCommandTypes.Device.Remove.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Device.Remove);
    if (!_caller) return;
    webitel.deviceRemove(_caller, args['device'] || '', function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});

commandEmitter.on('wss::' + WebitelCommandTypes.ReloadAgents.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.ReloadAgents);
    if (!_caller) return;
    webitel.reloadAgents(_caller, function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Gateway.List.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Gateway.List);
    if (!_caller) return;
    webitel.showSipGateway(_caller, args['domain'], function(res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Gateway.Create.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Gateway.Create);
    if (!_caller) return;
    webitel.createSipGateway(_caller, args, function (res) {
        getCommandResponseV2JSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Gateway.Change.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Gateway.Create);
    if (!_caller) return;
    webitel.changeSipGateway(_caller, args['name'], args['type'], args['params'], function (res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Gateway.Remove.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Gateway.Remove);
    if (!_caller) return;
    webitel.removeSipGateway(_caller, args['name'], function (res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Gateway.Up.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Gateway.Up);
    if (!_caller) return;
    webitel.upSipGateway(_caller, args['name'], args['profile'], function (res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Gateway.Down.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Gateway.Down);
    if (!_caller) return;
    webitel.downSipGateway(_caller, args['name'], function (res) {
        getCommandResponseJSON(ws, execId, res);
    });
});
//+
commandEmitter.on('wss::' + WebitelCommandTypes.Sys.Message.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.Sys.Message);
    if (!_caller) return;

    try {
        if (!args || !args['to'] || !args['body']) {
            getCommandResponseV2JSON(ws, execId, {
                "body": "-ERR bad request"
            });
            return;
        };

        var _to = Users.get(args['to']);
        if (!_to) {
            getCommandResponseV2JSON(ws, execId, {
                "body": "-ERR user not found"
            });
            return;
        };

        var msg = {
            to: _to['id'],
            from: _caller['id'],
            body: args['body'],
            'webitel-event-name': 'WEBITEL-CUSTOM',
            'Event-Name': 'WEBITEL-CUSTOM-MESSAGE'
        };

        Users.sendObject(_to, msg);

        getCommandResponseV2JSON(ws, execId, {
            "body": "-OK send"
        });
    } catch (e) {
        log.error(e['message']);
    }
});

var cdr = require('./cdr');
//+
commandEmitter.on('wss::' + WebitelCommandTypes.CDR.RecordCall.name, function (execId, args, ws) {
    var _caller = doSendWebitelCommand(execId, ws, WebitelCommandTypes.CDR.RecordCall);
    if (!_caller) return;
    cdr.existsRecordFile(args['uuid'], function (err, exists) {
        if (err) {
            getCommandResponseV2JSON(ws, execId, {
                "body": "-ERR: " + err['message']
            });
            return;
        };
        try {
            if (exists) {
                auth.getTokenWS(_caller, function (err, res) {
                    try {
                        if (err)
                            return getCommandResponseV2JSON(ws, execId, {
                                "body": "+OK: " + err['message']
                            });
                        var url = cdr.Route.Root + cdr.Route.GetFile + args['uuid'] + '?x_key=' + res['key'] +
                            '&access_token=' + res['token'];

                        getCommandResponseV2JSON(ws, execId, {
                            "body": url
                        });
                    } catch (e) {

                    }
                });
            } else {
                getCommandResponseV2JSON(ws, execId, {
                    "body": "+OK: " + "Not found."
                });
                return;
            }
            ;
        } catch (e) {
            getCommandResponseV2JSON(ws, execId, {
                "body": "+OK: " + e['message']
            });
            return;
        }
    });
});


var getCommandResponseJSON = function (_ws, id, res) {
    try {
        if (res['body'] instanceof Object)
            res['body'] = JSON.stringify(res['body']);
        _ws.send(JSON.stringify({
            'exec-uuid': id,
            'exec-complete': (res['body'].indexOf('-ERR') == 0 || res['body'].indexOf('-USAGE') == 0) ? "-ERR" : "+OK",
            'exec-response': {
                'response': res['body']
            }
        }));
    } catch (e) {
        handleSocketError(_ws);
        log.warn('Error send response');
    };
};

var getCommandResponseV2JSON = function (_ws, id, res) {
    try {
        if (res['body'] instanceof Object)
            res['body'] = JSON.stringify(res['body']);
        _ws.send(JSON.stringify({
            'exec-uuid': id,
            'exec-complete': (res['body'].indexOf('-ERR') == 0 || res['body'].indexOf('-USAGE') == 0) ? "-ERR" : "+OK",
            'exec-response': res['body']
        }));
    } catch (e) {
        handleSocketError(_ws);
        log.warn('Error send response');
    };
};

var doSendWebitelCommand = function (id, socket, command) {
    var _user = Users.get(socket['upgradeReq']['webitelId']);
    if (!_user || (_user['attr']['role'].val < command.perm)) {
        socket.send(JSON.stringify({
            'exec-uuid': id,
            'exec-complete': '+ERR',
            'exec-response': {
                'response': '-ERR permission denied!'
            }
        }));
        return null
    } else if (!webitel.authed) {
        try {
            socket.send(JSON.stringify({
                'exec-uuid': id,
                'exec-complete': '+ERR',
                'exec-response': {
                    'response': 'Webitel connect error.'
                }
            }));
            return null;
        } catch (e) {
            log.warn('User socket close:', e.message);
            return null;
        };
    };
    return _user;
};

var getJSONUserEvent = function (eventName, domainName, userId) {
    return {
        "Event-Name": eventName,
        "Event-Domain": domainName,
        "User-ID": userId,
        "User-Domain": domainName,
        "User-Scheme":"account",
        "Content-Type":"text/event-json",
        "webitel-event-name":"user"
    };
};
var sendCommandResponseWebitel = function (_ws, id, res) {
    try {
        _ws.send(JSON.stringify({
            'exec-uuid': id,
            'exec-complete': res.status,
            'exec-response': {
                'response': res['body']
            }
        }));
    } catch (e) {
        handleSocketError(_ws);
        log.warn(e.message);
    };
};
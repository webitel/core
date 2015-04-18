/**
 * Created by i.n. on 24.02.2015.
 */

var log = require('../../../lib/log')(module);

module.exports.Originate = function (req, res, next) {

    /*
     * {
     "calledId": "00",
     "callerId": "100@10.10.10.144",
     "auto_answer_param": "w_jsclient_xtransfer=true"
     }
     */

    var extension = req.body.calledId, // CALLE
        user = req.body.callerId || '', //CALLER
        auto_answer_param = req.body.auto_answer_param,
        dialString = '',
        _dialstring = req.body.dialstring
        ;
    if (_dialstring) {
        dialString = 'originate ' + _dialstring;
    } else {
        var _originatorParam = new Array('w_jsclient_originate_number=' + extension),
            _autoAnswerParam = [].concat(auto_answer_param || []),
            _param = '[' + _originatorParam.concat(_autoAnswerParam).join(',') + ']';

        dialString = ('originate ' + _param + 'user/' + user + ' ' + extension +
        ' xml default ' + user.split('@')[0] + ' ' + user.split('@')[0]);
        log.trace(dialString);
    };

    eslConn.bgapi(dialString, function (result) {
        sendResponse(result, res, "https://docs.webitel.com/display/SDKRU/REST+API+v1#RESTAPIv1-Создатьканал.");
    });
};

module.exports.KillChannelsFromDomain =  function (req, res, next) {
    try {
        var _item = '',
            _domain = req.params['domain'];
        if (req.webitelUser && req.webitelUser['attr'] && req.webitelUser['attr']['domain']) {
            _domain = req.webitelUser['attr']['domain']
        };
        if (_domain) {
            _item = ' like %@' + _domain;
        };
        eslConn.show('channels' + _item, 'json', function (err, parsed) {
            if (err)
                return res.status(500).json(rUtil.getRequestObject('error', err.message));
            try {
                if (parsed && parsed['rows']) {
                    for (var i = 0, len = parsed['rows'].length; i < len; i++) {
                        eslConn.bgapi('uuid_kill ' + parsed['rows'][i]['uuid']);
                    }
                    ;
                    res.status(200).json({
                        "status": "OK",
                        "data": "Command send."
                    });
                } else {
                    res.status(200).json({
                        "status": "OK",
                        "data": "No channels."
                    });
                }
                ;
            } catch (e) {
                next(e);
            };
        });
    } catch (e) {
        next(e);
    };
};

module.exports.fakeCall = function (req, res, next) {
    var number = req.body.number || '',
        displayNumber = req.body.displayNumber || '00000',
        dialString =  ''.concat('originate ', '[origination_caller_id_number=', displayNumber, ']', 'user/', number,
            ' &bridge(sofia/external/888@conference.freeswitch.org)')
        ;
    eslConn.bgapi(dialString, function (result) {
        sendResponse(result, res, "https://docs.webitel.com/display/SDKRU/REST+API+v1#RESTAPIv1-Создатьканал.");
    });
};

module.exports.HupAll = function (req, res, next) {
    eslConn.bgapi('hupall', function (result) {
        sendResponse(result, res, "https://docs.webitel.com/display/SDKRU/REST+API+v1#RESTAPIv1-Завершитьвсеканалы.");
    });
};

module.exports.KillUuid = function (req, res, next) {
    var params = req.params,
        uuid = params['id'],
        docsLink = "https://docs.webitel.com/display/SDKRU/REST+API+v1#RESTAPIv1-Завершить.";

    if (uuid) {
        eslConn.bgapi('uuid_kill ' + uuid, function (result) {
            sendResponse(result, res, docsLink);
        });
    } else {
        res.status(400).json({
            "status": "bad request",
            "info": "Bad parameters channel id",
            "more info": docsLink
        });
    };
};

module.exports.ChangeState = function (req, res, next) {
    var params = req.params,
        uuid = params['id'],
        state = req.body['state'],
        docUrlInfo = "https://docs.webitel.com/display/SDKRU/REST+API+v1#RESTAPIv1-Изменитьсостояниеканала.";

    if (uuid && state) {
        var app;

        switch (state) {
            case 'hold':
                app = 'uuid_hold';
                break;
            case 'unhold':
                app = 'uuid_hold off';
                break;
        };

        if (!app) {
            res.status(400).json({
                "status": "bad request",
                "info": "Bad parameters channel state",
                "more info": docUrlInfo
            });
            return;
        };
        eslConn.bgapi(app + ' ' + uuid, function (result) {
            sendResponse(result, res, docUrlInfo);
        });
    } else {
        res.status(400).json({
            "status": "bad request",
            "info": "Bad parameters channel id or state",
            "more info": docUrlInfo
        });
    };
};

function sendResponse(result, response, docsLinc) {
    try {
        if (result && result['body']) {
            response.status(200).json({
                "status": "OK",
                "info": result['body'],
                "more info": docsLinc
            });
        } else {
            response.status(200).json({
                "status": "error",
                "info": "No reply",
                "more info": docsLinc
            });
        }
    } catch (e) {
        response.status(500).json({
            "status": "error",
            "info": e.message,
            "more info": docsLinc
        });
    };
};
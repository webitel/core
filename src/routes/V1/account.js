module.exports.Create = function (req, res, next) {
    try {
        var domain = req.body.domain,
            login = req.body.login,
            role = req.body.role,
            password = req.body.password;

        if (domain && login && role) {
            if (!webitel.doSendCommand(res)) return;

            var _param =[];
            _param.push(login);
            if (password && password != '')
                _param.push(':' + password);
            _param.push('@' + domain);

            // TODO _caller - сделать когда будет логин работать
            var _caller = {
                attr: {
                    role: {
                        val: 2
                    }
                }
            };

            webitel.userCreate(_caller, role, _param.join(''), function(request) {
                res.status(200).send(request.body);
            });

        } else {
            res.status(400).send('login, role or domain is undefined.');
        }
    } catch (e) {
        next(e)
    }
};
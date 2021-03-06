const keystone = require('keystone')
const config = require('config')
const { promisify } = require('util')
const { WebError } = requireRoot('lib/errors')
const { confirmTemplate, recoverTemplate } = requireRoot('mail')
const { Message } = requireRoot('lib/mail')

const SecurityUser = keystone.list('SecurityUser').model
const SecurityClient = keystone.list('SecurityClient').model
const SecurityToken = keystone.list('SecurityToken').model
const SecurityCheck = keystone.list('SecurityCheck').model
const MainWallet = keystone.list('MainWallet').model

class SecurityService {
  async signup ({ name, email, password, investingAddress, personalAddress }) {
    const user = await SecurityUser.create({
      name,
      email,
      password,
      isConfirmed: false
    })

    const investingWallet = await MainWallet.create({
      owner: user,
      address: investingAddress,
      type: 'INVESTING'
    })

    const personalWallet = await MainWallet.create({
      owner: user,
      address: personalAddress,
      type: 'PERSONAL'
    })

    user.investingWallet = investingWallet
    user.personalWallet = personalWallet
    await user.save()

    const check = await SecurityCheck.create({
      user: user,
      type: 'confirm'
    })
    const { subject, content } = confirmTemplate({
      baseURL: config.get('mail.baseURL'),
      username: email,
      check: check.check
    })
    const message = new Message({
      to: email,
      subject,
      html: content
    })
    await message.send()
    return user
  }

  async forgot ({ email }) {
    const user = await SecurityUser.findOne({
      email
    }).exec()
    const check = await SecurityCheck.create({
      user: user,
      type: 'confirm'
    })
    const { subject, content } = recoverTemplate({
      baseURL: config.get('mail.baseURL'),
      username: email,
      check: check.check
    })
    const message = new Message({
      to: email,
      subject,
      html: content
    })
    await message.send()
    return user
  }

  async passwd ({ check, password }) {
    const c = await SecurityCheck.findOne({
      check,
      type: 'recover'
    }).populate('user')
    c.user.password = password
    await c.user.save()
    await SecurityCheck.remove(c)
    return c.user
  }

  async confirm ({ check }) {
    const c = await SecurityCheck.findOne({
      check,
      type: 'confirm'
    }).populate('user')
    c.user.isConfirmed = true
    await c.user.save()
    await SecurityCheck.remove(c)
    const token = await SecurityToken.create({
      user: c.user
    })
    return SecurityToken.findOne({
      _id: token._id
    }).populate('user')
      .exec()
  }

  async recover ({ check }) {
    const c = await SecurityCheck.findOne({
      check,
      type: 'confirm'
    }).populate('user')
    c.user.isConfirmed = true
    await c.user.save()
    const user = c.user
    await SecurityCheck.remove(c)
    const r = await SecurityCheck.create({
      user,
      type: 'recover'
    })
    const token = await SecurityToken.create({
      user: c.user
    })
    const t = await SecurityToken.findOne({
      _id: token._id
    }).populate('user')
      .exec()

    return {
      check: r,
      token: t
    }
  }

  async login ({ email, password }) {
    const user = await SecurityUser.findOne({ email }).exec()
    if (!user || !user.isConfirmed) {
      throw new WebError('Wrong credentials', 401)
    }
    if (!await promisify(user._.password.compare)(password)) {
      throw new WebError('Wrong credentials', 401)
    }
    const token = await SecurityToken.create({
      user: user
    })
    return SecurityToken.findOne({
      _id: token._id
    }).populate({ path: 'user', populate: { path: 'investingWallet' } })
      .exec()
  }

  async client ({ clientId, clientSecret, userId }) {
    const client = await SecurityClient.findOne({
      _id: clientId,
      secret: clientSecret
    }).populate('user')
      .exec()
    if (!client || !client.user || !client.user.isConfirmed) {
      throw new WebError('Wrong credentials', 401)
    }
    const user = (userId != null && client.user.isAdmin)
      ? await SecurityUser.findOne({ _id: userId })
      : client.user
    const token = await SecurityToken.create({
      user
    })
    return SecurityToken.findOne({
      _id: token._id
    }).populate('user')
      .exec()
  }

  async token ({ token }) {
    if (token.indexOf('Bearer ') !== 0) {
      throw new WebError('Wrong credentials', 401)
    }
    return SecurityToken.findOne({
      token: token.substring('Bearer '.length)
    }).populate({path: 'user', populate: { path: 'investingWallet' }})
      .exec()
  }

  async logout ({ token }) {
    if (token.indexOf('Bearer ') !== 0) {
      throw new WebError('Wrong credentials', 401)
    }
    const result = await SecurityToken.findOne({
      token: token.substring('Bearer '.length)
    }).populate('user')
      .exec()
    if (!result) {
      throw new WebError('Wrong credentials', 401)
    }
    result.remove()
    return result
  }
}

module.exports = SecurityService

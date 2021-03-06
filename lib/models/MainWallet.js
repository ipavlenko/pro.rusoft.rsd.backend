const keystone = require('keystone')
const Types = keystone.Field.Types

/**
 * Счет участника системы
 */
const MainWallet = new keystone.List('MainWallet', {
  map: { name: 'address' },
  sortable: true
})

MainWallet.add({
  owner: { type: Types.Relationship,
    ref: 'SecurityUser',
    required: true,
    initial: true,
    index: true },
  address: { type: String, initial: true, required: true },
  createdDate: { type: Date, default: Date.now, required: true },
  type: {
    type: Types.Select,
    required: true,
    initial: true,
    options: [
      { value: 'INVESTING', label: 'Инвестиционный' },
      { value: 'PERSONAL', label: 'Персональный' }
    ]
  },
  objectId: { type: String, hidden: true }
})

MainWallet.schema.pre('save', async function (next) {
  this.objectId = this._id
  next()
})

MainWallet.defaultColumns = 'address, owner, type, createdDate'
MainWallet.register()

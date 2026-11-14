Component({
  options: { multipleSlots: true, styleIsolation: 'apply-shared' },
  properties: { visible: Boolean, title: String, compact: Boolean },
  methods: { close() { this.triggerEvent('close'); }, stop() {} }
});

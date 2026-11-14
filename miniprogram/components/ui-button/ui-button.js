Component({
  properties: {
    label: String,
    variant: { type: String, value: 'primary' },
    size: { type: String, value: 'default' },
    disabled: Boolean,
    loading: Boolean
  },
  methods: {
    activate() {
      if (!this.data.disabled && !this.data.loading) this.triggerEvent('activate');
    }
  }
});

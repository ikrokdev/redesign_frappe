export default filter_presets = [
  { title: "Default",
    id: "0",
    configuration: []
  },
  { title: "Open",
    id: "1",
    configuration:  [["Task","status","=","Open",false]]
  },
  { title: "Completed",
    id: "2",
    configuration: [["Task","status","=","Completed",false]]
  }
]
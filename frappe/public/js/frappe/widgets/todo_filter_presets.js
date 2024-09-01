const today = new Date().toISOString().split('T')[0];

export default filter_presets = [
  { title: "All",
    id: "0",
    configuration: []
  },
  { title: "Due today",
    id: "1",
    configuration:  [["Task","exp_end_date","=", today, false]]
  },
  { title: "Overdue",
    id: "2",
    configuration: [["Task","exp_end_date","<", today, false]]
  },
  { title: "Upcoming",
    id: "3",
    configuration: [["Task","exp_end_date",">", today, false]]
  }
]
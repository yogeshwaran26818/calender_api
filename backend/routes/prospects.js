const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const PROSPECTS_FILE = path.join(__dirname, '../data/prospects.json');

// Read prospects from JSON file
async function readProspects() {
  const data = await fs.readFile(PROSPECTS_FILE, 'utf8');
  return JSON.parse(data);
}

// Write prospects to JSON file
async function writeProspects(data) {
  await fs.writeFile(PROSPECTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// GET all prospects
router.get('/', async (req, res) => {
  try {
    const prospects = await readProspects();
    res.json(prospects);
  } catch (err) {
    console.error('Error reading prospects:', err);
    res.status(500).json({ error: 'Failed to read prospects' });
  }
});

// GET prospect by ID
router.get('/:id', async (req, res) => {
  try {
    const prospects = await readProspects();
    const prospect = prospects.data.find(p => p.id === req.params.id);
    if (!prospect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    res.json(prospect);
  } catch (err) {
    console.error('Error reading prospect:', err);
    res.status(500).json({ error: 'Failed to read prospect' });
  }
});

// POST create new prospect
router.post('/', async (req, res) => {
  try {
    const prospects = await readProspects();
    const newProspect = {
      id: `cmi${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
      ...req.body,
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      _count: { messages: 0 }
    };
    prospects.data.push(newProspect);
    await writeProspects(prospects);
    res.status(201).json(newProspect);
  } catch (err) {
    console.error('Error creating prospect:', err);
    res.status(500).json({ error: 'Failed to create prospect' });
  }
});

// PUT update prospect
router.put('/:id', async (req, res) => {
  try {
    const prospects = await readProspects();
    const index = prospects.data.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    prospects.data[index] = { ...prospects.data[index], ...req.body };
    await writeProspects(prospects);
    res.json(prospects.data[index]);
  } catch (err) {
    console.error('Error updating prospect:', err);
    res.status(500).json({ error: 'Failed to update prospect' });
  }
});

// DELETE prospect
router.delete('/:id', async (req, res) => {
  try {
    const prospects = await readProspects();
    const index = prospects.data.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    prospects.data.splice(index, 1);
    await writeProspects(prospects);
    res.json({ success: true, message: 'Prospect deleted' });
  } catch (err) {
    console.error('Error deleting prospect:', err);
    res.status(500).json({ error: 'Failed to delete prospect' });
  }
});

module.exports = router;
